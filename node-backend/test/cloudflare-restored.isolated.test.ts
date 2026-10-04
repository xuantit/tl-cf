import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), request: vi.fn(),
  interceptors: { response: { use: vi.fn() } },
}));
vi.mock("axios", () => ({ default: { create: () => http } }));

import { clearAccountIdCache, cloudflareService, CloudflareError, defaultActionForKind, rulePhaseForKind } from "../src/services/cloudflare.js";

const credentials = { authType: "apiToken" as const, apiToken: "isolated-token" };
const accountId = "a".repeat(32);
const ok = (result: unknown) => ({ data: { success: true, result } });

beforeEach(() => { vi.resetAllMocks(); clearAccountIdCache(); });
afterEach(() => { vi.restoreAllMocks(); clearAccountIdCache(); });

describe("restored Cloudflare service contracts (mock HTTP only)", () => {
  it("maps WAF custom rules to the established phase and action", () => {
    expect(rulePhaseForKind("security")).toBe("http_request_firewall_custom");
    expect(defaultActionForKind("security")).toBe("block");
  });

  it("keeps source account identity and nameservers on list/detail/create results", async () => {
    const raw = { id: "zone", name: "example.com", status: "active", account: { id: accountId }, name_servers: ["ns.example.com"] };
    http.get.mockResolvedValueOnce(ok([raw])).mockResolvedValueOnce(ok(raw));
    http.post.mockResolvedValue(ok(raw));
    expect((await cloudflareService.listZones(credentials))[0]).toMatchObject({ accountId, nameServers: raw.name_servers });
    expect(await cloudflareService.getZoneDetails(credentials, "zone")).toMatchObject({ accountId, nameServers: raw.name_servers });
    expect(await cloudflareService.createZone(credentials, "example.com", accountId, false)).toMatchObject({ accountId, nameServers: raw.name_servers });
    expect(http.post).toHaveBeenCalledWith("/zones", { name: "example.com", account: { id: accountId }, jump_start: false });
  });

  it("isolates cached native account resolution by credentials, expires it and clears it", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    http.get.mockResolvedValueOnce(ok([{ id: accountId, name: "A" }]))
      .mockResolvedValueOnce(ok([{ id: "b".repeat(32), name: "B" }]))
      .mockResolvedValue(ok([{ id: accountId, name: "A" }]));
    expect(await cloudflareService.resolveAccountId(credentials)).toBe(accountId);
    expect(await cloudflareService.resolveAccountId(credentials)).toBe(accountId);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(await cloudflareService.resolveAccountId({ ...credentials, apiToken: "different-token" })).toBe("b".repeat(32));
    clock.mockReturnValue(61001);
    await cloudflareService.resolveAccountId(credentials);
    expect(http.get).toHaveBeenCalledTimes(3);
    clearAccountIdCache();
    await cloudflareService.resolveAccountId(credentials);
    expect(http.get).toHaveBeenCalledTimes(4);
  });

  it("rejects empty account scope rather than reusing another credential cache", async () => {
    http.get.mockResolvedValueOnce(ok([{ id: accountId, name: "A" }])).mockResolvedValueOnce(ok([]));
    await cloudflareService.resolveAccountId(credentials);
    await expect(cloudflareService.resolveAccountId({ ...credentials, apiToken: "no-access" })).rejects.toBeInstanceOf(CloudflareError);
  });

  it("retries read-only GraphQL after 429 and sends the established request shape", async () => {
    http.post.mockRejectedValueOnce({ response: { status: 429, headers: { "retry-after": "0" } } })
      .mockResolvedValueOnce({ data: { data: { viewer: { zones: [] } } } });
    expect(await cloudflareService.queryGraphql(credentials, "query", { zoneTag: "zone" })).toEqual({ viewer: { zones: [] } });
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.post).toHaveBeenLastCalledWith("/graphql", { query: "query", variables: { zoneTag: "zone" } });
  });

  it("maps GraphQL authorization errors and rejects empty data", async () => {
    http.post.mockResolvedValueOnce({ data: { errors: [{ message: "not authorized", extensions: { code: "authz" } }] } })
      .mockResolvedValueOnce({ data: { data: null } });
    await expect(cloudflareService.queryGraphql(credentials, "query", {})).rejects.toMatchObject({ status: 403, retryable: false });
    await expect(cloudflareService.queryGraphql(credentials, "query", {})).rejects.toBeInstanceOf(CloudflareError);
  });

  it("paginates access rules and preserves the zone-scoped write payload", async () => {
    const rule = { id: "rule", mode: "block" as const, configuration: { target: "ip" as const, value: "203.0.113.7" }, notes: "test" };
    http.get.mockResolvedValueOnce({ data: { success: true, result: [rule], result_info: { total_pages: 2 } } })
      .mockResolvedValueOnce({ data: { success: true, result: [{ ...rule, id: "rule-2" }], result_info: { total_pages: 2 } } });
    expect(await cloudflareService.listAccessRules(credentials, "zone")).toHaveLength(2);
    expect(http.get).toHaveBeenLastCalledWith("/zones/zone/firewall/access_rules/rules", { params: { page: 2, per_page: 100 } });
    http.post.mockResolvedValue(ok(rule));
    const input = { mode: rule.mode, configuration: rule.configuration, notes: rule.notes };
    await cloudflareService.createAccessRule(credentials, "zone", input);
    expect(http.post).toHaveBeenCalledWith("/zones/zone/firewall/access_rules/rules", input);
  });

  it("redacts Turnstile secrets and preserves Enterprise flags on update", async () => {
    const raw = { sitekey: "widget", name: "Widget", domains: ["example.com"], mode: "managed", secret: "never-return",
      bot_fight_mode: true, ephemeral_id: true, offlabel: true };
    http.request.mockResolvedValue(ok(raw));
    const input = { name: "New", domains: ["example.com"], mode: "invisible" as const, clearanceLevel: "managed" as const };
    expect(await cloudflareService.updateTurnstileWidget(credentials, accountId, "widget", input)).not.toHaveProperty("secret");
    expect(http.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: "put", data: {
      name: "New", domains: ["example.com"], mode: "invisible", clearance_level: "managed",
      bot_fight_mode: true, ephemeral_id: true, offlabel: true,
    } }));
    await expect(cloudflareService.getTurnstileWidget(credentials, accountId, "../escape")).rejects.toThrow();
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  it("maps tunnels without exposing the creation token", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue(accountId);
    http.post.mockResolvedValue(ok({ id: "tunnel", name: "edge", status: "inactive", remote_config: true, token: "never-return" }));
    const tunnel = await cloudflareService.createTunnel(credentials, "edge");
    expect(tunnel).toMatchObject({ id: "tunnel", remoteConfig: true, connections: [] });
    expect(tunnel).not.toHaveProperty("token");
    expect(http.post).toHaveBeenCalledWith(`/accounts/${accountId}/cfd_tunnel`, { name: "edge", config_src: "cloudflare" });
  });

  it("reads Worker module content via content/v2 and sends secret_text without echoing it", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue(accountId);
    http.get.mockResolvedValue({ data: '--boundary\r\nContent-Type: application/javascript\r\n\r\nexport default {};\r\n--boundary--' });
    expect(await cloudflareService.getWorkerScriptContent(credentials, "worker")).toBe("export default {};");
    expect(http.get).toHaveBeenCalledWith(`/accounts/${accountId}/workers/scripts/worker/content/v2`, expect.objectContaining({ responseType: "text" }));
    http.put.mockResolvedValue(ok({}));
    expect(await cloudflareService.putWorkerSecret(credentials, "worker", "KEY", "secret")).toBeUndefined();
    expect(http.put).toHaveBeenCalledWith(`/accounts/${accountId}/workers/scripts/worker/secrets`, { name: "KEY", text: "secret", type: "secret_text" });
  });

  it("preserves Pages pagination, redacts environment secrets and nulls removed keys", async () => {
    vi.spyOn(cloudflareService, "resolveAccountId").mockResolvedValue(accountId);
    http.get.mockResolvedValueOnce({ data: { success: true, result: [{ id: "deployment", latest_stage: { status: "success" } }], result_info: { total_pages: 3, total_count: 60 } } })
      .mockResolvedValueOnce(ok({ name: "project", deployment_configs: { production: { env_vars: { SECRET: { type: "secret_text", value: "never-return" } } } } }));
    expect(await cloudflareService.listPagesDeployments(credentials, "project", 2)).toMatchObject({ page: 2, totalPages: 3, totalCount: 60 });
    expect(await cloudflareService.getPagesProject(credentials, "project")).toMatchObject({ envVars: [{ key: "SECRET", value: "", secret: true }] });
    http.patch.mockResolvedValue(ok({}));
    await cloudflareService.patchPagesEnvVars(credentials, "project", [{ key: "NEW", value: "value", secret: false }], ["OLD"]);
    expect(http.patch).toHaveBeenCalledWith(`/accounts/${accountId}/pages/projects/project`, {
      deployment_configs: { production: { env_vars: { NEW: { value: "value", type: "plain_text" }, OLD: null } } },
    });
  });
});