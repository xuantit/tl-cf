import { beforeEach, describe, expect, it, vi } from "vitest";

type Responder = () => any;

const mockState = vi.hoisted(() => ({
  responders: {
    get: null as Responder | null,
    post: null as Responder | null,
    patch: null as Responder | null,
    put: null as Responder | null,
    delete: null as Responder | null,
  },
  calls: {
    get: [] as any[],
    post: [] as any[],
    patch: [] as any[],
    put: [] as any[],
    delete: [] as any[],
  },
}));

function makeAxiosError(status: number, message: string) {
  const error: any = new Error(message);
  error.config = { url: "x", method: "get" };
  error.response = {
    status,
    headers: {},
    data: { errors: [{ code: status, message }] },
  };
  return error;
}

vi.mock("axios", () => {
  const method = (name: keyof typeof mockState.responders) =>
    vi.fn(async (...args: any[]) => {
      mockState.calls[name].push(args);
      const responder = mockState.responders[name];
      if (!responder) {
        throw new Error(`No responder configured for ${name}`);
      }
      return responder();
    });

  return {
    default: {
      create: vi.fn(() => ({
        interceptors: { response: { use: vi.fn() } },
        get: method("get"),
        post: method("post"),
        patch: method("patch"),
        put: method("put"),
        delete: method("delete"),
      })),
    },
  };
});

import { cloudflareService } from "../src/services/cloudflare.js";

const credentials = { authType: "apiToken" as const, apiToken: "token" };

describe("cloudflare ruleset adapter", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockState.responders) as Array<keyof typeof mockState.responders>) {
      mockState.responders[key] = null;
      mockState.calls[key] = [];
    }
  });

  it("returns empty rules when entrypoint does not exist (404)", async () => {
    mockState.responders.get = () => {
      throw makeAxiosError(404, "not found");
    };

    const result = await cloudflareService.getRulesetRules(credentials, "zone_1", "http_request_dynamic_redirect");

    expect(result).toEqual({ rulesetId: null, phase: "http_request_dynamic_redirect", rules: [] });
  });

  it("maps entrypoint rules with positions", async () => {
    mockState.responders.get = () => ({
      data: {
        success: true,
        result: {
          id: "rs_1",
          rules: [
            { id: "r1", enabled: true, description: "a", expression: "true", action: "set_cache_settings", action_parameters: { cache: true } },
            { id: "r2", enabled: false, description: "b", expression: 'http.host eq "x"', action: "set_cache_settings" },
          ],
        },
      },
    });

    const result = await cloudflareService.getRulesetRules(credentials, "zone_1", "http_request_cache_settings");

    expect(result.rulesetId).toBe("rs_1");
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]).toMatchObject({ id: "r1", enabled: true, position: 1, actionParameters: { cache: true } });
    expect(result.rules[1]).toMatchObject({ id: "r2", enabled: false, position: 2 });
  });

  it("creates a rule and returns the last created rule", async () => {
    mockState.responders.get = () => ({
      data: {
        success: true,
        result: { id: "rs_1", rules: [{ id: "old", action: "redirect", expression: "false" }] },
      },
    });
    mockState.responders.post = () => ({
      data: {
        success: true,
        result: {
          id: "rs_1",
          rules: [
            { id: "old", action: "redirect", expression: "false" },
            { id: "new", action: "redirect", expression: "true", enabled: true, description: "" },
          ],
        },
      },
    });

    const result = await cloudflareService.createRulesetRule(credentials, "zone_1", "http_request_dynamic_redirect", {
      expression: "true",
      action: "redirect",
      actionParameters: { from_value: { target_url: { value: "https://x" } } },
    });

    expect(result.id).toBe("new");
    expect(mockState.calls.post[0][0]).toBe("/zones/zone_1/rulesets/rs_1/rules");
    expect(mockState.calls.post[0][1]).toMatchObject({ expression: "true", action: "redirect" });
  });

  it("deletes a rule", async () => {
    mockState.responders.get = () => ({
      data: { success: true, result: { id: "rs_1", rules: [{ id: "r1" }] } },
    });
    mockState.responders.delete = () => ({ data: { success: true } });

    await expect(
      cloudflareService.deleteRulesetRule(credentials, "zone_1", "http_config_settings", "r1"),
    ).resolves.toBeUndefined();

    expect(mockState.calls.delete[0][0]).toBe(
      "/zones/zone_1/rulesets/rs_1/rules/r1",
    );
  });

  it("creates the first rule via PUT when no entrypoint exists yet", async () => {
    // Entrypoint missing -> getRulesetRules returns null rulesetId (404).
    mockState.responders.get = () => {
      throw makeAxiosError(404, "not found");
    };
    mockState.responders.put = () => ({
      data: {
        success: true,
        result: {
          id: "rs_new",
          rules: [{ id: "r1", action: "redirect", expression: "true", enabled: true, description: "" }],
        },
      },
    });

    const result = await cloudflareService.createRulesetRule(credentials, "zone_1", "http_request_dynamic_redirect", {
      expression: "true",
      action: "redirect",
    });

    expect(result.id).toBe("r1");
    expect(mockState.calls.put[0][0]).toBe(
      "/zones/zone_1/rulesets/phases/http_request_dynamic_redirect/entrypoint",
    );
    expect(mockState.calls.post.length).toBe(0);
  });

  it("reorders rules via PUT entrypoint", async () => {
    mockState.responders.put = () => ({
      data: {
        success: true,
        result: {
          id: "rs_1",
          rules: [
            { id: "r1", expression: "true", action: "set_cache_settings", enabled: true, description: "" },
            { id: "r2", expression: "false", action: "set_cache_settings", enabled: true, description: "" },
          ],
        },
      },
    });

    const result = await cloudflareService.reorderRulesetRules(credentials, "zone_1", "http_request_cache_settings", [
      { expression: "true", action: "set_cache_settings" },
      { expression: "false", action: "set_cache_settings" },
    ]);

    expect(result.rules.map((r) => r.position)).toEqual([1, 2]);
    expect(mockState.calls.put[0][0]).toBe(
      "/zones/zone_1/rulesets/phases/http_request_cache_settings/entrypoint",
    );
    expect(mockState.calls.put[0][1]).toMatchObject({ rules: expect.any(Array) });
  });
});
