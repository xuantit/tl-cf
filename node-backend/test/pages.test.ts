import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { app } from "../src/app.js";
import {
  clearAccountIdCache,
  cloudflareService,
  type PagesDeployment,
  type PagesProject,
} from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { db } from "../src/services/db.js";
import { changeSets, cloudflareAccounts, users } from "../src/db/schema.js";
import { encrypt } from "../src/utils/encryption.js";

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `pages-test-${run}@example.com`;
const password = "PagesTestPass123";

let userId: string;
let accountId: string;
let token: string;

const sampleDeployment: PagesDeployment = {
  id: "deploy-1",
  environment: "production",
  url: "https://abc123.my-site.pages.dev",
  createdOn: "2026-08-10T00:00:00Z",
  modifiedOn: "2026-08-10T00:05:00Z",
  branch: "main",
  commitHash: "abc123def",
  status: "success",
};

const sampleProject: PagesProject = {
  name: "my-site",
  subdomain: "my-site.pages.dev",
  domains: ["my-site.pages.dev", "example.com"],
  createdOn: "2026-08-01T00:00:00Z",
  productionBranch: "main",
  latestDeployment: sampleDeployment,
};

const rawDeployment = {
  id: "deploy-1",
  environment: "production",
  url: "https://abc123.my-site.pages.dev",
  created_on: "2026-08-10T00:00:00Z",
  modified_on: "2026-08-10T00:05:00Z",
  deployment_trigger: { metadata: { branch: "main", commit_hash: "abc123def" } },
  latest_stage: { name: "deploy", status: "success" },
};

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, role: "user" }).returning();
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `pages-test-${run}`,
    globalApiKeyEncrypted: encrypt("dummy-pages-token"),
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

describe("GET /api/pages/projects", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/pages/projects");
    expect(res.status).toBe(401);
  });

  it("maps the raw Cloudflare payload to PagesProject objects", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: {
        success: true,
        result: [
          {
            name: "my-site",
            subdomain: "my-site.pages.dev",
            domains: ["my-site.pages.dev", "example.com"],
            created_on: "2026-08-01T00:00:00Z",
            production_branch: "main",
            latest_deployment: rawDeployment,
          },
          {
            name: "empty-site",
            domains: [],
            latest_deployment: null,
          },
        ],
      },
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/pages/projects?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      projects: [
        sampleProject,
        { name: "empty-site", domains: [], latestDeployment: null },
      ],
    });
    expect(fakeGet).toHaveBeenCalledWith("/accounts/acct-1/pages/projects");
  });
});

describe("GET /api/pages/projects/:projectName/deployments", () => {
  it("lists deployments for a project", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: { success: true, result: [rawDeployment], result_info: { total_pages: 3, total_count: 55 } },
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/pages/projects/my-site/deployments?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deployments: [sampleDeployment], page: 1, totalPages: 3, totalCount: 55 });
    expect(fakeGet).toHaveBeenCalledWith("/accounts/acct-1/pages/projects/my-site/deployments", {
      params: { page: 1, per_page: 25 },
    });
  });

  it("passes the requested page through and clamps invalid values", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: { success: true, result: [], result_info: { total_pages: 3, total_count: 55 } },
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/pages/projects/my-site/deployments?accountId=${accountId}&page=2`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(fakeGet).toHaveBeenCalledWith("/accounts/acct-1/pages/projects/my-site/deployments", {
      params: { page: 2, per_page: 25 },
    });

    const bad = await request(app)
      .get(`/api/pages/projects/my-site/deployments?accountId=${accountId}&page=oops`)
      .set("Authorization", `Bearer ${token}`);
    expect(bad.status).toBe(200);
    expect(bad.body.page).toBe(1);
  });
});

describe("POST /api/pages/projects/:projectName/deployments/:deploymentId/rollback", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/pages/projects/my-site/deployments/deploy-1/rollback");
    expect(res.status).toBe(401);
  });

  it("rolls back and returns the mapped deployment", async () => {
    const spy = vi
      .spyOn(cloudflareService, "rollbackPagesDeployment")
      .mockResolvedValue(sampleDeployment);

    const res = await request(app)
      .post(`/api/pages/projects/my-site/deployments/deploy-1/rollback?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleDeployment);
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-site", "deploy-1");
  });

  it("records a change set when a deployment is rolled back", async () => {
    vi.spyOn(cloudflareService, "rollbackPagesDeployment").mockResolvedValue(sampleDeployment);

    const res = await request(app)
      .post(`/api/pages/projects/my-site/deployments/deploy-history/rollback?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const history = await request(app)
      .get("/api/changes?action=pages.deployment.rollback")
      .set("Authorization", `Bearer ${token}`);
    expect(history.status).toBe(200);
    const entry = history.body.find(
      (c: { items: { resourceId: string }[] }) => c.items[0]?.resourceId === "deploy-history",
    );
    expect(entry).toBeTruthy();
    expect(entry.items[0]).toMatchObject({
      resourceType: "pages_deployment",
      resourceId: "deploy-history",
      after: { project: "my-site" },
    });
  });
});

describe("GET /api/pages/projects/:projectName/domains", () => {
  it("lists domains for a project", async () => {
    const spy = vi
      .spyOn(cloudflareService, "listPagesDomains")
      .mockResolvedValue([{ id: "dom-1", name: "example.com", status: "active" }]);

    const res = await request(app)
      .get(`/api/pages/projects/my-site/domains?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ domains: [{ id: "dom-1", name: "example.com", status: "active" }] });
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-site");
  });
});

describe("GET /api/pages/projects/:projectName", () => {
  it("returns project detail with flattened env vars (secrets masked)", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: {
        success: true,
        result: {
          name: "my-site",
          production_branch: "main",
          deployment_configs: {
            production: {
              env_vars: {
                PLAIN_VAR: { value: "hello", type: "plain_text" },
                NO_TYPE_VAR: { value: "world" },
                SECRET_VAR: { type: "secret_text" },
              },
            },
          },
        },
      },
    });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet });

    const res = await request(app)
      .get(`/api/pages/projects/my-site?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "my-site",
      productionBranch: "main",
      envVars: [
        { key: "PLAIN_VAR", value: "hello", secret: false },
        { key: "NO_TYPE_VAR", value: "world", secret: false },
        { key: "SECRET_VAR", value: "", secret: true },
      ],
    });
    expect(fakeGet).toHaveBeenCalledWith("/accounts/acct-1/pages/projects/my-site");
  });
});

describe("PATCH /api/pages/projects/:projectName/env", () => {
  it("normalizes secretValue/value and sends the CF PATCH shape with null for removed keys", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakePatch = vi.fn().mockResolvedValue({ data: { success: true, result: {} } });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ patch: fakePatch });

    const res = await request(app)
      .patch(`/api/pages/projects/my-site/env?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        envVars: [
          { key: "PLAIN_VAR", value: "hello", secret: false },
          { key: "SECRET_VAR", secretValue: "shhh", secret: true },
        ],
        removedKeys: ["OLD_VAR"],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(fakePatch).toHaveBeenCalledWith("/accounts/acct-1/pages/projects/my-site", {
      deployment_configs: {
        production: {
          env_vars: {
            PLAIN_VAR: { value: "hello", type: "plain_text" },
            SECRET_VAR: { value: "shhh", type: "secret_text" },
            OLD_VAR: null,
          },
        },
      },
    });
  });

  it("rejects an invalid env key with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "patchPagesEnvVars");

    const res = await request(app)
      .patch(`/api/pages/projects/my-site/env?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ envVars: [{ key: "1-BAD KEY", value: "x", secret: false }] });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a secret var without secretValue with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "patchPagesEnvVars");

    const res = await request(app)
      .patch(`/api/pages/projects/my-site/env?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ envVars: [{ key: "SECRET_VAR", secret: true }] });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("POST /api/pages/projects/:projectName/deployments/:deploymentId/retry", () => {
  it("retries and returns the mapped deployment", async () => {
    const spy = vi.spyOn(cloudflareService, "retryPagesDeployment").mockResolvedValue(sampleDeployment);

    const res = await request(app)
      .post(`/api/pages/projects/my-site/deployments/deploy-1/retry?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleDeployment);
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-site", "deploy-1");
  });
});

describe("DELETE /api/pages/projects/:projectName/deployments/:deploymentId", () => {
  it("deletes a deployment with force=true and returns 204", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeDelete = vi.fn().mockResolvedValue({ data: { success: true, result: null } });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ delete: fakeDelete });

    const res = await request(app)
      .delete(`/api/pages/projects/my-site/deployments/deploy-1?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(fakeDelete).toHaveBeenCalledWith("/accounts/acct-1/pages/projects/my-site/deployments/deploy-1", {
      params: { force: true },
    });
  });
});

describe("DELETE /api/pages/projects/:projectName/deployments (delete all)", () => {
  it("deletes every deployment with the live production one last", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: {
        success: true,
        result: [
          rawDeployment, // deploy-1: live production — deleted last
          { ...rawDeployment, id: "deploy-2", environment: "preview" },
          { ...rawDeployment, id: "deploy-3" }, // older production
        ],
        result_info: { total_pages: 1, total_count: 3 },
      },
    });
    const fakeDelete = vi.fn().mockResolvedValue({ data: { success: true, result: null } });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet, delete: fakeDelete });

    const res = await request(app)
      .delete(`/api/pages/projects/my-site/deployments?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3, failed: 0 });
    expect(fakeDelete).toHaveBeenCalledTimes(3);
    // Live production deployment must be the last delete call
    expect(fakeDelete.mock.calls[2][0]).toBe("/accounts/acct-1/pages/projects/my-site/deployments/deploy-1");
  });

  it("counts failures instead of aborting", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeGet = vi.fn().mockResolvedValue({
      data: {
        success: true,
        result: [
          { ...rawDeployment, id: "deploy-2", environment: "preview" },
          { ...rawDeployment, id: "deploy-3", environment: "preview" },
        ],
        result_info: { total_pages: 1, total_count: 2 },
      },
    });
    const fakeDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ data: { success: true, result: null } });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ get: fakeGet, delete: fakeDelete });

    const res = await request(app)
      .delete(`/api/pages/projects/my-site/deployments?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 1, failed: 1 });
  });
});

describe("DELETE /api/pages/projects/:projectName", () => {
  it("deletes the whole Pages project and returns 204", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue("acct-1");
    const fakeDelete = vi.fn().mockResolvedValue({ data: { success: true, result: null } });
    vi.spyOn(cloudflareService as any, "createClient").mockReturnValue({ delete: fakeDelete });

    const res = await request(app)
      .delete(`/api/pages/projects/my-site?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(fakeDelete).toHaveBeenCalledWith("/accounts/acct-1/pages/projects/my-site");
  });
});

describe("pages custom domains", () => {
  it("adds a domain and returns 201", async () => {
    const spy = vi
      .spyOn(cloudflareService, "addPagesDomain")
      .mockResolvedValue({ id: "dom-2", name: "app.example.com", status: "pending" });

    const res = await request(app)
      .post(`/api/pages/projects/my-site/domains?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "app.example.com" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "dom-2", name: "app.example.com", status: "pending" });
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-site", "app.example.com");
  });

  it("rejects an invalid domain name with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "addPagesDomain");

    const res = await request(app)
      .post(`/api/pages/projects/my-site/domains?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "bad_domain!" });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("deletes a domain and returns 204", async () => {
    const spy = vi.spyOn(cloudflareService, "deletePagesDomain").mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/pages/projects/my-site/domains/app.example.com?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(expect.anything(), "my-site", "app.example.com");
  });

  it("rejects an invalid domain param on delete with 400", async () => {
    const res = await request(app)
      .delete(`/api/pages/projects/my-site/domains/${encodeURIComponent("exa_mple.com")}?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
