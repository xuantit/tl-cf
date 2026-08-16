import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { and, eq } from "drizzle-orm";

import { app } from "../src/app.js";
import {
  clearAccountIdCache,
  cloudflareService,
  type WorkerScript,
} from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { db } from "../src/services/db.js";
import { auditLogs, changeSets, cloudflareAccounts, users } from "../src/db/schema.js";
import { encrypt } from "../src/utils/encryption.js";

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `workers-test-${run}@example.com`;
const password = "WorkersTestPass123";

let userId: string;
let accountId: string;
let token: string;

const sampleScript: WorkerScript = {
  id: "my-worker",
  createdOn: "2026-08-01T00:00:00Z",
  modifiedOn: "2026-08-10T00:00:00Z",
  handlers: ["fetch"],
  routes: [{ id: "route-1", pattern: "example.com/*" }],
  lastDeployedFrom: "dash",
  compatibilityDate: "2026-08-01",
  hasAssets: false,
  logpush: false,
};

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, role: "user" }).returning();
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `workers-test-${run}`,
    globalApiKeyEncrypted: encrypt("dummy-workers-token"),
  });
  accountId = account.id;

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await db.delete(changeSets).where(eq(changeSets.ownerId, userId));
  await db.delete(auditLogs).where(eq(auditLogs.userId, userId));
  await db.delete(cloudflareAccounts).where(eq(cloudflareAccounts.id, accountId));
  await db.delete(users).where(eq(users.id, userId));
});

afterEach(() => {
  vi.restoreAllMocks();
  clearAccountIdCache();
});

describe("GET /api/workers/scripts", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/workers/scripts");
    expect(res.status).toBe(401);
  });

  it("maps the raw Cloudflare payload to WorkerScript objects", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockImplementation(async (path: string) => {
      if (path === "/accounts/acct-1/workers/scripts") {
        return {
          data: {
            success: true,
            result: [
              {
                id: "my-worker",
                created_on: "2026-08-01T00:00:00Z",
                modified_on: "2026-08-10T00:00:00Z",
                handlers: ["fetch"],
                routes: [{ id: "route-1", pattern: "example.com/*" }],
                last_deployed_from: "dash",
                compatibility_date: "2026-08-01",
                has_assets: false,
                logpush: false,
              },
            ],
          },
        };
      }
      if (path === "/accounts/acct-1/workers/subdomain") {
        return { data: { success: true, result: { subdomain: "my-team" } } };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/workers/scripts?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scripts: [sampleScript], subdomain: "my-team" });
  });

  it("returns scripts with subdomain null when the subdomain fetch fails", async () => {
    vi.spyOn(cloudflareService, "listWorkerScripts").mockResolvedValue([sampleScript]);
    vi.spyOn(cloudflareService, "getWorkersSubdomain").mockRejectedValue(new Error("boom"));

    const res = await request(app)
      .get(`/api/workers/scripts?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scripts: [sampleScript], subdomain: null });
  });
});

describe("DELETE /api/workers/scripts/:scriptName", () => {
  it("deletes a script and returns 204", async () => {
    const spy = vi.spyOn(cloudflareService, "deleteWorkerScript").mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/workers/scripts/my-worker?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-worker");
  });

  it("records a change set when a script is deleted", async () => {
    vi.spyOn(cloudflareService, "deleteWorkerScript").mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/workers/scripts/history-worker?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);

    const history = await request(app)
      .get("/api/changes?action=worker.delete")
      .set("Authorization", `Bearer ${token}`);
    expect(history.status).toBe(200);
    const entry = history.body.find(
      (c: { items: { resourceId: string }[] }) => c.items[0]?.resourceId === "history-worker",
    );
    expect(entry).toBeTruthy();
    expect(entry.items[0]).toMatchObject({ resourceType: "worker_script", resourceId: "history-worker" });
  });
});

describe("worker routes", () => {
  it("lists routes for a zone", async () => {
    const spy = vi
      .spyOn(cloudflareService, "listWorkerRoutes")
      .mockResolvedValue([{ id: "route-1", pattern: "example.com/*", script: "my-worker" }]);

    const res = await request(app)
      .get(`/api/workers/zones/zone-1/routes?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ routes: [{ id: "route-1", pattern: "example.com/*", script: "my-worker" }] });
    expect(spy).toHaveBeenCalledWith(expect.anything(), "zone-1");
  });

  it("creates a route and returns 201", async () => {
    const spy = vi
      .spyOn(cloudflareService, "createWorkerRoute")
      .mockResolvedValue({ id: "route-2", pattern: "example.com/api/*", script: "my-worker" });

    const res = await request(app)
      .post(`/api/workers/zones/zone-1/routes?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ pattern: "example.com/api/*", script: "my-worker" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "route-2", pattern: "example.com/api/*", script: "my-worker" });
    expect(spy).toHaveBeenCalledWith(expect.anything(), "zone-1", "example.com/api/*", "my-worker");
  });

  it("rejects an empty pattern with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "createWorkerRoute");

    const res = await request(app)
      .post(`/api/workers/zones/zone-1/routes?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ pattern: "   ", script: "my-worker" });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("deletes a route and returns 204", async () => {
    const spy = vi.spyOn(cloudflareService, "deleteWorkerRoute").mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/workers/zones/zone-1/routes/route-1?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(expect.anything(), "zone-1", "route-1");
  });
});

describe("GET /api/workers/scripts/:scriptName/content", () => {
  it("returns raw JS as text/plain for a service-worker script", async () => {
    const script = 'addEventListener("fetch", (event) => event.respondWith(new Response("ok")));';
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({ data: script });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/workers/scripts/my-worker/content?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toBe(script);
    expect(fakeGet).toHaveBeenCalledWith(
      "/accounts/acct-1/workers/scripts/my-worker/content/v2",
      expect.objectContaining({ responseType: "text" }),
    );
  });

  it("extracts the first part body from a multipart module worker response", async () => {
    const boundary = "--formdata-boundary-abc123";
    const moduleBody = ['export default {', '  async fetch() { return new Response("hi"); },', "};"].join("\n");
    const multipart = [
      boundary,
      'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
      "Content-Type: application/javascript+module",
      "",
      ...moduleBody.split("\n"),
      `${boundary}--`,
      "",
    ].join("\r\n");
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({ data: multipart });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/workers/scripts/my-worker/content?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe(moduleBody);
  });

  it("rejects an unsafe script name with 400", async () => {
    const res = await request(app)
      .get(`/api/workers/scripts/${encodeURIComponent("bad$name")}/content?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe("worker schedules", () => {
  it("lists schedules for a script", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: { success: true, result: { schedules: [{ cron: "*/5 * * * *" }, { cron: "0 0 * * *" }] } },
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/workers/scripts/my-worker/schedules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ schedules: ["*/5 * * * *", "0 0 * * *"] });
    expect(fakeGet).toHaveBeenCalledWith("/accounts/acct-1/workers/scripts/my-worker/schedules");
  });

  it("updates schedules with the CF body shape and returns the new list", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakePut = vi.fn().mockResolvedValue({
      data: { success: true, result: { schedules: [{ cron: "*/10 * * * *" }] } },
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ put: fakePut });

    const res = await request(app)
      .put(`/api/workers/scripts/my-worker/schedules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ schedules: ["*/10 * * * *"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ schedules: ["*/10 * * * *"] });
    expect(fakePut).toHaveBeenCalledWith("/accounts/acct-1/workers/scripts/my-worker/schedules", [
      { cron: "*/10 * * * *" },
    ]);
  });

  it("rejects a cron expression without 5 fields with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "putWorkerSchedules");

    const res = await request(app)
      .put(`/api/workers/scripts/my-worker/schedules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ schedules: ["* * *"] });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("worker subdomain setting", () => {
  it("returns enabled + previewsEnabled", async () => {
    vi.spyOn(cloudflareService, "getWorkerSubdomainSetting").mockResolvedValue({
      enabled: true,
      previewsEnabled: false,
    });

    const res = await request(app)
      .get(`/api/workers/scripts/my-worker/subdomain?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, previewsEnabled: false });
  });

  it("toggles the subdomain setting", async () => {
    const spy = vi
      .spyOn(cloudflareService, "setWorkerSubdomainSetting")
      .mockResolvedValue({ enabled: true, previewsEnabled: true });

    const res = await request(app)
      .post(`/api/workers/scripts/my-worker/subdomain?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true });
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-worker", true);
  });

  it("rejects a non-boolean enabled with 400", async () => {
    const res = await request(app)
      .post(`/api/workers/scripts/my-worker/subdomain?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: "yes" });

    expect(res.status).toBe(400);
  });
});

describe("worker secrets", () => {
  it("lists secrets", async () => {
    vi.spyOn(cloudflareService, "listWorkerSecrets").mockResolvedValue([
      { name: "API_KEY", type: "secret_text" },
    ]);

    const res = await request(app)
      .get(`/api/workers/scripts/my-worker/secrets?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ secrets: [{ name: "API_KEY", type: "secret_text" }] });
  });

  it("puts a secret via secretValue, returns 204, and never stores the value in the audit log", async () => {
    const secretValue = `super-secret-${run}`;
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakePut = vi.fn().mockResolvedValue({ data: { success: true, result: {} } });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ put: fakePut });

    const res = await request(app)
      .put(`/api/workers/scripts/my-worker/secrets?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "API_KEY", secretValue });

    expect(res.status).toBe(204);
    expect(fakePut).toHaveBeenCalledWith("/accounts/acct-1/workers/scripts/my-worker/secrets", {
      name: "API_KEY",
      text: secretValue,
      type: "secret_text",
    });

    // Audit log được ghi fire-and-forget khi response finish — poll tới khi có row.
    const auditPath = "/api/workers/scripts/my-worker/secrets";
    let rows: Array<{ metaJson: string | null }> = [];
    for (let attempt = 0; attempt < 40 && rows.length === 0; attempt += 1) {
      rows = await db
        .select({ metaJson: auditLogs.metaJson })
        .from(auditLogs)
        .where(and(eq(auditLogs.userId, userId), eq(auditLogs.path, auditPath), eq(auditLogs.method, "PUT")));
      if (rows.length === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(rows.length).toBeGreaterThan(0);
    const meta = rows[rows.length - 1].metaJson ?? "";
    expect(meta).toContain("[REDACTED]");
    expect(meta).not.toContain(secretValue);
  });

  it("rejects an invalid secret name with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "putWorkerSecret");

    const res = await request(app)
      .put(`/api/workers/scripts/my-worker/secrets?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "1BAD-NAME", secretValue: "x" });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("deletes a secret and returns 204", async () => {
    const spy = vi.spyOn(cloudflareService, "deleteWorkerSecret").mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/workers/scripts/my-worker/secrets/API_KEY?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-worker", "API_KEY");
  });

  it("rejects an unsafe secret name segment with 400", async () => {
    const res = await request(app)
      .delete(`/api/workers/scripts/my-worker/secrets/${encodeURIComponent("bad$secret")}?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
