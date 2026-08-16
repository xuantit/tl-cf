import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { app } from "../src/app.js";
import {
  clearAccountIdCache,
  cloudflareService,
  type Tunnel,
  type TunnelIngressRule,
} from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { db } from "../src/services/db.js";
import { changeSets, cloudflareAccounts, users } from "../src/db/schema.js";
import { encrypt } from "../src/utils/encryption.js";

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `tunnels-test-${run}@example.com`;
const password = "TunnelsTestPass123";
const tunnelId = `tun-${run}`;

let userId: string;
let accountId: string;
let token: string;

const sampleTunnel: Tunnel = {
  id: tunnelId,
  name: "edge",
  status: "healthy",
  createdAt: "2026-08-01T00:00:00Z",
  remoteConfig: true,
  connections: [
    {
      colo: "SIN",
      version: "2026.8.0",
      originIp: "203.0.113.9",
      openedAt: "2026-08-10T00:00:00Z",
      clientId: "client-1",
    },
  ],
};

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, role: "user" }).returning();
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `tunnels-test-${run}`,
    globalApiKeyEncrypted: encrypt("dummy-tunnels-token"),
  });
  accountId = account.id;

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await db.delete(changeSets).where(eq(changeSets.ownerId, userId));
  await db.delete(cloudflareAccounts).where(eq(cloudflareAccounts.id, accountId));
  await db.delete(users).where(eq(users.id, userId));
});

afterEach(() => {
  vi.restoreAllMocks();
  clearAccountIdCache();
});

describe("GET /api/tunnels", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/tunnels");
    expect(res.status).toBe(401);
  });

  it("maps the raw Cloudflare payload to Tunnel objects", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: {
        success: true,
        result: [
          {
            id: tunnelId,
            name: "edge",
            status: "healthy",
            created_at: "2026-08-01T00:00:00Z",
            remote_config: true,
            token: "eyJ-should-never-leak",
            connections: [
              {
                colo_name: "SIN",
                client_version: "2026.8.0",
                origin_ip: "203.0.113.9",
                opened_at: "2026-08-10T00:00:00Z",
                client_id: "client-1",
              },
            ],
          },
        ],
      },
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/tunnels?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tunnels: [sampleTunnel] });
    expect(JSON.stringify(res.body)).not.toContain("eyJ-should-never-leak");
    expect(fakeGet).toHaveBeenCalledWith("/accounts/acct-1/cfd_tunnel", {
      params: { is_deleted: false },
    });
  });
});

describe("POST /api/tunnels", () => {
  it("creates a tunnel and returns 201", async () => {
    const spy = vi.spyOn(cloudflareService, "createTunnel").mockResolvedValue(sampleTunnel);

    const res = await request(app)
      .post(`/api/tunnels?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "edge" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(sampleTunnel);
    expect(spy).toHaveBeenCalledWith(expect.anything(), "edge");
  });

  it("rejects an empty name with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "createTunnel");

    const res = await request(app)
      .post(`/api/tunnels?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "   " });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("PUT /api/tunnels/:tunnelId/configurations", () => {
  it("appends the catch-all rule when missing", async () => {
    const spy = vi
      .spyOn(cloudflareService, "putTunnelConfiguration")
      .mockImplementation(async (_creds, _id, ingress) => ({ ingress, source: "cloudflare" }));

    const res = await request(app)
      .put(`/api/tunnels/${tunnelId}/configurations?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }],
      });

    expect(res.status).toBe(200);
    const expected: TunnelIngressRule[] = [
      { hostname: "app.example.com", service: "http://localhost:3000" },
      { service: "http_status:404" },
    ];
    expect(spy).toHaveBeenCalledWith(expect.anything(), tunnelId, expected);
    expect(res.body.ingress).toEqual(expected);
  });

  it("preserves an existing catch-all without duplicating it", async () => {
    const spy = vi
      .spyOn(cloudflareService, "putTunnelConfiguration")
      .mockImplementation(async (_creds, _id, ingress) => ({ ingress, source: "cloudflare" }));

    const ingress: TunnelIngressRule[] = [
      { hostname: "app.example.com", service: "https://127.0.0.1:8443" },
      { service: "http_status:404" },
    ];

    const res = await request(app)
      .put(`/api/tunnels/${tunnelId}/configurations?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ingress });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.anything(), tunnelId, ingress);
    expect(spy.mock.calls[0][2]).toHaveLength(2);
  });

  it("rejects an invalid service protocol with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "putTunnelConfiguration");

    const res = await request(app)
      .put(`/api/tunnels/${tunnelId}/configurations?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        ingress: [{ hostname: "app.example.com", service: "gopher://localhost" }],
      });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("POST /api/tunnels/:tunnelId/token/reveal", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).post(`/api/tunnels/${tunnelId}/token/reveal`);
    expect(res.status).toBe(401);
  });

  it("returns the tunnel token", async () => {
    const spy = vi.spyOn(cloudflareService, "getTunnelToken").mockResolvedValue("eyJhIjoidHVubmVsIn0");

    const res = await request(app)
      .post(`/api/tunnels/${tunnelId}/token/reveal?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: "eyJhIjoidHVubmVsIn0" });
    expect(spy).toHaveBeenCalledWith(expect.anything(), tunnelId);
  });
});

describe("change history", () => {
  it("records a change set when a tunnel is deleted", async () => {
    vi.spyOn(cloudflareService, "deleteTunnel").mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/tunnels/${tunnelId}?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);

    const history = await request(app)
      .get("/api/changes?action=tunnel.delete")
      .set("Authorization", `Bearer ${token}`);
    expect(history.status).toBe(200);
    const entry = history.body.find(
      (c: { action: string; items: { resourceId: string }[] }) => c.items[0]?.resourceId === tunnelId,
    );
    expect(entry).toBeTruthy();
    expect(entry.status).toBe("done");
    expect(entry.items[0]).toMatchObject({ resourceType: "tunnel", resourceId: tunnelId });
  });
});
