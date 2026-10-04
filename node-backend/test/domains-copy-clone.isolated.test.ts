import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BulkJob, BulkJobItemInput } from "../src/services/jobRunner.js";

// No app bootstrap, DB, credentials, network, seed, or background timers in this suite.
const mocks = vi.hoisted(() => ({
  getCredentials: vi.fn(),
  config: {
    loadConfig: vi.fn(), getAccountById: vi.fn(), getAccountByLabel: vi.fn(), getAllAccounts: vi.fn(),
    getDomainByZoneId: vi.fn(), addDomain: vi.fn(), updateDomainSettings: vi.fn(),
  },
  history: vi.fn(), createChangeSet: vi.fn(),
  jobs: [] as Array<{ job: BulkJob; inputs: BulkJobItemInput[]; worker: (item: BulkJobItemInput) => Promise<unknown> }>,
}));

vi.mock("../src/services/db.js", () => ({ db: new Proxy({}, { get() { throw new Error("DB forbidden in isolated route tests"); } }) }));
vi.mock("axios", () => ({ default: { create: () => { throw new Error("Network forbidden in isolated route tests"); } } }));
vi.mock("../src/utils/logger.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth(req: Request, res: Response, next: NextFunction) {
    const userId = req.header("authorization")?.replace(/^Bearer /, "");
    if (!userId) return res.status(401).json({ detail: "Missing token" });
    req.auth = { userId, role: "user", email: `${userId}@example.com` };
    next();
  },
}));
vi.mock("../src/routes/cf.js", () => ({ getCredentials: mocks.getCredentials }));
vi.mock("../src/services/configService.js", () => ({ configService: mocks.config }));
vi.mock("../src/services/changes.js", () => ({ recordChangeSafe: mocks.history, createChangeSet: mocks.createChangeSet }));
vi.mock("../src/services/jobRunner.js", () => ({
  createJob(type: string, ownerId: string, inputs: BulkJobItemInput[], worker: (item: BulkJobItemInput) => Promise<unknown>) {
    const job: BulkJob = {
      id: `job-${mocks.jobs.length + 1}`, type, ownerId, status: "running", total: inputs.length,
      processed: 0, succeeded: 0, failed: 0, createdAt: 0,
      items: inputs.map((item) => ({ ...item, status: "pending" })),
    };
    mocks.jobs.push({ job, inputs, worker });
    return job;
  },
  getJobWithHistory: async (id: string) => mocks.jobs.find(({ job }) => job.id === id)?.job,
  listJobs: async (ownerId: string) => mocks.jobs.filter(({ job }) => job.ownerId === ownerId).map(({ job }) => job),
}));

import { cloudflareService, CloudflareError } from "../src/services/cloudflare.js";
import { domainsRouter } from "../src/routes/domains.js";
import { jobsRouter } from "../src/routes/jobs.js";

const app = express();
app.use(express.json());
app.use("/api/domains", domainsRouter);
app.use("/api/jobs", jobsRouter);
const credentials = { authType: "apiToken" as const, apiToken: "fake-test-token" };
const cfAccountId = "a".repeat(32);
const account = { id: "owned-account", label: "Primary", isActive: true, authType: "apiToken", domains: [] };
const copyBody = {
  sourceZoneId: "source-id", sourceZoneName: "source.com",
  targets: [{ zoneId: "target-id", zoneName: "target.com" }], components: ["dns"], dnsMode: "skip",
};
const cloneBody = {
  sourceZoneId: "source-id", sourceZoneName: "source.com",
  newDomains: ["clone.com"], components: ["dns"], dnsMode: "skip",
};
function post(route: string, body: unknown, query = "accountId=owned-account", userId = "owner") {
  return request(app).post(`/api/domains/${route}?${query}`).set("Authorization", `Bearer ${userId}`).send(body);
}

// Exercise the same success/error/counter contract and three worker attempts as
// the real runner, without importing its DB persistence or waiting on retry timers.
async function finishJob(index = 0) {
  const { job, inputs, worker } = mocks.jobs[index];
  for (const [i, input] of inputs.entries()) {
    const item = job.items[i];
    item.status = "running";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        item.result = await worker(input);
        item.status = "success";
        job.succeeded++;
        break;
      } catch (error) {
        item.error = (error as Error).message;
        if (attempt === 2) { item.status = "error"; job.failed++; }
      }
    }
    job.processed++;
  }
  job.status = "done";
  return job;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  mocks.jobs.length = 0;
  mocks.config.getAccountById.mockImplementation(async (id, ownerId) => id === account.id && ownerId === "owner" ? account : null);
  mocks.config.getAccountByLabel.mockImplementation(async (label, ownerId) => label === account.label && ownerId === "owner" ? account : null);
  mocks.config.getAllAccounts.mockImplementation(async (ownerId) => ownerId === "owner" ? [account] : []);
  mocks.config.getDomainByZoneId.mockImplementation(async (_accountId, zoneId) => zoneId === "source-id" ? { settings: { tags: ["production"] } } : null);
  mocks.config.addDomain.mockResolvedValue({ id: "new-local-domain" });
  mocks.getCredentials.mockImplementation(async (ownerId, id) => {
    if (ownerId !== "owner" || id !== account.id) throw new Error("Unexpected credential scope");
    return credentials;
  });
  vi.spyOn(cloudflareService, "getZoneDetails").mockImplementation(async (_credentials, id) => {
    const name = id === "source-id" ? "source.com" : id === "target-id" ? "target.com" : undefined;
    if (!name) throw new CloudflareError({ status: 403, message: "Zone not authorized" });
    return { id, name, status: "active", accountId: cfAccountId };
  });
  vi.spyOn(cloudflareService, "listDnsRecords").mockImplementation(async (_credentials, id) => id === "source-id" ? [
    { id: "record-source", type: "CNAME", name: "www.source.com", content: "source.com", ttl: 1, proxied: true },
  ] : []);
  vi.spyOn(cloudflareService, "createDnsRecord").mockImplementation(async (_credentials, _zoneId, record) => ({ ...record, id: "record-new" }));
  vi.spyOn(cloudflareService, "deleteDnsRecord").mockResolvedValue();
  vi.spyOn(cloudflareService, "createZone").mockImplementation(async (_credentials, name) => ({
    id: `created-${name}`, name, status: "pending", nameServers: ["ns1.cloudflare.com"], accountId: cfAccountId,
  }));
  vi.spyOn(cloudflareService, "listAccounts").mockResolvedValue([{ id: "b".repeat(32), name: "Wrong default account" }]);
});

describe("copy/clone isolated route contracts", () => {
  it("copies DNS through the existing snapshot/apply service and exposes owner-only progress", async () => {
    const response = await post("copy-config", copyBody);
    expect(response.status).toBe(202);
    expect(mocks.jobs[0].job).toMatchObject({ type: "copy-config", ownerId: "owner", total: 1, processed: 0 });
    expect(cloudflareService.createDnsRecord).not.toHaveBeenCalled();
    const job = await finishJob();
    expect(job).toMatchObject({ status: "done", processed: 1, succeeded: 1, failed: 0 });
    expect(cloudflareService.createDnsRecord).toHaveBeenCalledWith(credentials, "target-id", expect.objectContaining({
      name: "www.target.com", content: "target.com",
    }));
    expect(mocks.history).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner", accountId: account.id, action: "config.copy" }));
    expect((await request(app).get(`/api/jobs/${job.id}`).set("Authorization", "Bearer owner")).body.items[0].result.steps[0].status).toBe("success");
    expect((await request(app).get(`/api/jobs/${job.id}`).set("Authorization", "Bearer other-user")).status).toBe(404);
  });

  it.each(["skip", "overwrite"])("honors DNS conflict mode %s", async (dnsMode) => {
    vi.mocked(cloudflareService.listDnsRecords).mockResolvedValue([
      { id: "existing", type: "CNAME", name: "www.target.com", content: "target.com", ttl: 1 },
    ]).mockResolvedValueOnce([
      { id: "source-record", type: "CNAME", name: "www.source.com", content: "source.com", ttl: 1 },
    ]);
    expect((await post("copy-config", { ...copyBody, dnsMode })).status).toBe(202);
    await finishJob();
    expect(cloudflareService.deleteDnsRecord).toHaveBeenCalledTimes(dnsMode === "overwrite" ? 1 : 0);
    expect(cloudflareService.createDnsRecord).toHaveBeenCalledTimes(dnsMode === "overwrite" ? 1 : 0);
  });

  it("clones into the source native account, normalizes/deduplicates names and inherits owned tags", async () => {
    expect((await post("clone", { ...cloneBody, newDomains: [" Clone.COM ", "clone.com", "second.com"] }, "label=Primary")).status).toBe(202);
    expect(mocks.jobs[0].job.total).toBe(2);
    const job = await finishJob();
    expect(job).toMatchObject({ type: "clone-domain", succeeded: 2, failed: 0, processed: 2 });
    expect(cloudflareService.createZone).toHaveBeenCalledWith(credentials, "clone.com", cfAccountId, false);
    expect(cloudflareService.listAccounts).not.toHaveBeenCalled();
    expect(mocks.config.getAccountByLabel).toHaveBeenCalledWith("Primary", "owner");
    expect(mocks.getCredentials).toHaveBeenCalledWith("owner", account.id);
    expect(mocks.config.addDomain).toHaveBeenCalledWith(account.id, expect.objectContaining({ name: "clone.com", settings: { tags: ["production"] } }));
    expect(job.items[0].result).toMatchObject({ name: "clone.com", zoneId: "created-clone.com", status: "pending",
      nameServers: ["ns1.cloudflare.com"], nameservers: ["ns1.cloudflare.com"] });
    expect(mocks.history).toHaveBeenCalledWith(expect.objectContaining({ accountId: account.id, ownerId: "owner", action: "domain.clone" }));
  });

  it("resolves default token-only credentials to the same owned account for clone sync", async () => {
    expect((await post("clone", cloneBody, "")).status).toBe(202);
    await finishJob();
    expect(mocks.config.getAllAccounts).toHaveBeenCalledWith("owner");
    expect(mocks.config.addDomain).toHaveBeenCalledWith(account.id, expect.anything());
  });

  it("copies WAF security rules with the restored phase/action mapping", async () => {
    const getRules = vi.spyOn(cloudflareService, "getRulesetRules").mockResolvedValue({
      rulesetId: "ruleset", phase: "http_request_firewall_custom", rules: [
        { id: "rule", enabled: true, description: "WAF", expression: 'http.host eq "source.com"', action: "block" },
      ],
    });
    const createRule = vi.spyOn(cloudflareService, "createRulesetRule").mockResolvedValue({
      id: "new-rule", enabled: true, description: "WAF", expression: 'http.host eq "target.com"', action: "block",
    });
    expect((await post("copy-config", { ...copyBody, components: ["securityRules"] })).status).toBe(202);
    await finishJob();
    expect(getRules).toHaveBeenCalledWith(credentials, "source-id", "http_request_firewall_custom");
    expect(createRule).toHaveBeenCalledWith(credentials, "target-id", "http_request_firewall_custom", expect.objectContaining({ expression: 'http.host eq "target.com"', action: "block" }));
  });

  it.each(["copy-config", "clone"])("%s marks partial failures and does not replay writes on worker retries", async (route) => {
    vi.mocked(cloudflareService.createDnsRecord).mockRejectedValue(new CloudflareError({ status: 403, message: "DNS write denied" }));
    expect((await post(route, route === "clone" ? cloneBody : copyBody)).status).toBe(202);
    const job = await finishJob();
    expect(job).toMatchObject({ failed: 1, succeeded: 0, processed: 1 });
    expect(job.items[0]).toMatchObject({ status: "error", result: { steps: [expect.objectContaining({ status: "error" })] } });
    expect(cloudflareService.createDnsRecord).toHaveBeenCalledTimes(1);
    expect(cloudflareService.createZone).toHaveBeenCalledTimes(route === "clone" ? 1 : 0);
    expect(mocks.history).toHaveBeenCalledTimes(1);
  });

  it("reuses settings and Page Rule copying with hostname substitution", async () => {
    vi.spyOn(cloudflareService, "getSslMode").mockResolvedValue({ mode: "strict" });
    vi.spyOn(cloudflareService, "getCacheSettings").mockResolvedValue({ cache_level: "aggressive", browser_cache_ttl: 300 });
    vi.spyOn(cloudflareService, "getSecuritySettings").mockResolvedValue({
      always_use_https: "on", automatic_https_rewrites: "on", security_level: "high", development_mode: "off",
    });
    vi.spyOn(cloudflareService, "updateSslMode").mockResolvedValue({ mode: "strict" });
    vi.spyOn(cloudflareService, "updateCacheSettings").mockResolvedValue({});
    vi.spyOn(cloudflareService, "updateZoneSetting").mockImplementation(async (_credentials, _zoneId, id, value) => ({ id, value }));
    const pageRule = {
      id: "page-rule", priority: 1, status: "active",
      targets: [{ target: "url", constraint: { operator: "matches", value: "source.com/*" } }],
      actions: [{ id: "forwarding_url", value: { url: "https://www.source.com/$1", status_code: 301 } }],
    };
    vi.spyOn(cloudflareService, "listPageRules").mockResolvedValue([pageRule]);
    vi.spyOn(cloudflareService, "createPageRule").mockImplementation(async (_credentials, _zoneId, rule) => ({ id: "new-page-rule", ...rule }));
    expect((await post("copy-config", { ...copyBody, components: ["settings", "pageRules"] })).status).toBe(202);
    expect((await finishJob()).succeeded).toBe(1);
    expect(cloudflareService.updateSslMode).toHaveBeenCalledWith(credentials, "target-id", "strict");
    expect(cloudflareService.updateZoneSetting).toHaveBeenCalledWith(credentials, "target-id", "security_level", "high");
    expect(cloudflareService.createPageRule).toHaveBeenCalledWith(credentials, "target-id", {
      priority: 1, status: "active",
      targets: [{ target: "url", constraint: { operator: "matches", value: "target.com/*" } }],
      actions: [{ id: "forwarding_url", value: { url: "https://www.target.com/$1", status_code: 301 } }],
    });
    expect(cloudflareService.createDnsRecord).not.toHaveBeenCalled();
  });

  it("does not create clone zones when source snapshot collection fails", async () => {
    vi.mocked(cloudflareService.listDnsRecords).mockRejectedValue(new CloudflareError({ status: 403, message: "Source DNS read denied" }));
    expect((await post("clone", cloneBody)).status).toBe(403);
    expect(mocks.jobs).toHaveLength(0);
    expect(cloudflareService.createZone).not.toHaveBeenCalled();
  });

  it("does not retry ambiguous zone-creation failures", async () => {
    vi.mocked(cloudflareService.createZone).mockRejectedValue(new Error("Connection lost after POST"));
    expect((await post("clone", cloneBody)).status).toBe(202);
    expect((await finishJob()).failed).toBe(1);
    expect(cloudflareService.createZone).toHaveBeenCalledTimes(1);
    expect(cloudflareService.createDnsRecord).not.toHaveBeenCalled();
  });

  it("keeps clone application working when local sync fails", async () => {
    mocks.config.addDomain.mockRejectedValue(new Error("Local sync unavailable"));
    expect((await post("clone", cloneBody)).status).toBe(202);
    expect((await finishJob()).succeeded).toBe(1);
    expect(cloudflareService.createZone).toHaveBeenCalledTimes(1);
  });

  it.each(["copy-config", "clone"])("%s requires authentication", async (route) => {
    expect((await request(app).post(`/api/domains/${route}`).send({})).status).toBe(401);
    expect(mocks.getCredentials).not.toHaveBeenCalled();
  });

  it.each([
    ["copy-config", copyBody, "accountId=foreign-account", "owner"],
    ["clone", cloneBody, "accountId=owned-account", "other-user"],
    ["copy-config", copyBody, "label=Foreign", "owner"],
    ["clone", cloneBody, "accountId=owned-account&label=Wrong", "owner"],
  ])("%s rejects unowned or contradictory account scope (%s)", async (route, body, query, userId) => {
    expect((await post(route as string, body, query as string, userId as string)).status).toBe(403);
    expect(mocks.getCredentials).not.toHaveBeenCalled();
    expect(cloudflareService.getZoneDetails).not.toHaveBeenCalled();
    expect(mocks.jobs).toHaveLength(0);
  });

  it("rejects inactive accounts without falling back", async () => {
    mocks.config.getAccountById.mockResolvedValue({ ...account, isActive: false });
    expect((await post("clone", cloneBody)).status).toBe(403);
    expect(mocks.getCredentials).not.toHaveBeenCalled();
  });

  it.each(["accountId=x&accountId=y", "label=x&label=y", "accountId="])("rejects malformed query %s", async (query) => {
    expect((await post("copy-config", copyBody, query)).status).toBe(400);
    expect(mocks.getCredentials).not.toHaveBeenCalled();
  });

  it.each([
    { sourceZoneId: "../foreign" }, { sourceZoneId: "%2Fforeign" }, { sourceZoneName: "evil.com" },
    { components: [] }, { components: ["workers"] }, { dnsMode: "delete" }, { accountId: "foreign-account" },
    { targets: [] }, { targets: [{ zoneId: "source-id", zoneName: "source.com" }] },
    { targets: [copyBody.targets[0], copyBody.targets[0]] },
    { targets: [{ zoneId: "target-id", zoneName: "spoofed.com" }] },
    { targets: Array.from({ length: 101 }, (_, index) => ({ zoneId: `target-${index}`, zoneName: "target.com" })) },
  ])("rejects invalid copy payload %# before any job/write", async (patch) => {
    expect((await post("copy-config", { ...copyBody, ...patch })).status).toBe(400);
    expect(mocks.jobs).toHaveLength(0);
    expect(cloudflareService.createDnsRecord).not.toHaveBeenCalled();
  });

  it.each([
    [], [" "], ["not a domain!"], ["https://clone.com/path"], ["-clone.com"], ["clone..com"],
    ["source.com"], ["clone.123"], ["clone.c"], ["x".repeat(64) + ".com"], Array.from({ length: 51 }, (_, i) => `clone${i}.com`),
  ].map((newDomains) => ({ newDomains })))("rejects invalid clone names %# before any job/write", async ({ newDomains }) => {
    expect((await post("clone", { ...cloneBody, newDomains })).status).toBe(400);
    expect(mocks.jobs).toHaveLength(0);
    expect(cloudflareService.createZone).not.toHaveBeenCalled();
  });

  it("fails closed on a source without a native CF account instead of using the first accessible account", async () => {
    vi.mocked(cloudflareService.getZoneDetails).mockResolvedValue({ id: "source-id", name: "source.com", status: "active" });
    const response = await post("clone", cloneBody);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("CLOUDFLARE_ACCOUNT_NOT_FOUND");
    expect(cloudflareService.createZone).not.toHaveBeenCalled();
  });

  it.each([
    { components: [] }, { components: ["invalid"] }, { dnsMode: "invalid" },
    { sourceZoneId: "../../zone" }, { sourceZoneName: "spoofed.com" }, { cfAccountId: "b".repeat(32) },
  ])("rejects invalid clone options %#", async (patch) => {
    expect((await post("clone", { ...cloneBody, ...patch })).status).toBe(400);
    expect(mocks.jobs).toHaveLength(0);
    expect(cloudflareService.createZone).not.toHaveBeenCalled();
  });

  it("uses skip when DNS mode is omitted", async () => {
    const { dnsMode: _dnsMode, ...body } = copyBody;
    vi.mocked(cloudflareService.listDnsRecords).mockResolvedValueOnce([
      { id: "src", type: "A", name: "www.source.com", content: "203.0.113.1", ttl: 300 },
    ]).mockResolvedValueOnce([
      { id: "tgt", type: "A", name: "www.target.com", content: "203.0.113.2", ttl: 300 },
    ]);
    expect((await post("copy-config", body)).status).toBe(202);
    expect((await finishJob()).succeeded).toBe(1);
    expect(cloudflareService.deleteDnsRecord).not.toHaveBeenCalled();
    expect(cloudflareService.createDnsRecord).not.toHaveBeenCalled();
  });

  it("rejects a foreign target before source collection or writes", async () => {
    const response = await post("copy-config", { ...copyBody, targets: [copyBody.targets[0], { zoneId: "foreign-id", zoneName: "foreign.com" }] });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CLOUDFLARE_FORBIDDEN");
    expect(cloudflareService.listDnsRecords).not.toHaveBeenCalled();
    expect(mocks.jobs).toHaveLength(0);
  });

  it.each(["copy-config", "clone"])("%s propagates denied source access without creating a job", async (route) => {
    vi.mocked(cloudflareService.getZoneDetails).mockRejectedValue(new CloudflareError({ status: 403, message: "Not authorized" }));
    expect((await post(route, route === "clone" ? cloneBody : copyBody)).status).toBe(403);
    expect(cloudflareService.listDnsRecords).not.toHaveBeenCalled();
    expect(mocks.jobs).toHaveLength(0);
  });
});