import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  mode: "get429ThenOk" as "get429ThenOk" | "post429",
  clients: [] as Array<any>,
}));

function createMockClient(mode: "get429ThenOk" | "post429") {
  const state = {
    getCalls: 0,
    postCalls: 0,
    requestCalls: 0,
  };

  let onRejected: ((error: any) => Promise<any> | any) | undefined;

  const runWithInterceptor = async (error: any) => {
    if (!onRejected) {
      throw error;
    }
    return onRejected(error);
  };

  const client: any = {
    __state: state,
    interceptors: {
      response: {
        use: (_onFulfilled: any, rejected: (error: any) => Promise<any> | any) => {
          onRejected = rejected;
        },
      },
    },
    request: vi.fn(async (config: any) => {
      state.requestCalls += 1;
      const method = (config.method || "get").toLowerCase();
      if (method === "get") {
        return client.get(config.url, config);
      }
      if (method === "post") {
        return client.post(config.url, config.data, config);
      }
      throw new Error(`Unsupported method: ${method}`);
    }),
    get: vi.fn(async (url: string, config?: any) => {
      state.getCalls += 1;

      if (mode === "get429ThenOk" && url === "/accounts" && state.getCalls === 1) {
        const error: any = new Error("Rate limited");
        error.config = { ...(config || {}), url, method: "get" };
        error.response = {
          status: 429,
          headers: { "retry-after": "0" },
          data: { errors: [{ code: 10000, message: "rate limit" }] },
        };
        return runWithInterceptor(error);
      }

      if (url === "/accounts") {
        return {
          data: {
            success: true,
            result: [{ id: "acc_1", name: "Account One" }],
          },
        };
      }

      return { data: { success: true, result: [] } };
    }),
    post: vi.fn(async (url: string, data?: any, config?: any) => {
      state.postCalls += 1;

      if (mode === "post429" && url === "/zones") {
        const error: any = new Error("Rate limited post");
        error.config = { ...(config || {}), data, url, method: "post" };
        error.response = {
          status: 429,
          headers: { "retry-after": "0" },
          data: { errors: [{ code: 10000, message: "rate limit post" }] },
        };
        return runWithInterceptor(error);
      }

      return {
        data: {
          success: true,
          result: {
            id: "zone_1",
            name: "example.com",
            status: "pending",
            name_servers: [],
            ssl: { status: "unknown" },
          },
        },
      };
    }),
  };

  return client;
}

vi.mock("axios", () => {
  return {
    default: {
      create: vi.fn(() => {
        const client = createMockClient(mockState.mode);
        mockState.clients.push(client);
        return client;
      }),
    },
  };
});

import { CloudflareError, cloudflareService } from "../src/services/cloudflare.js";

describe("cloudflare retry behavior", () => {
  beforeEach(() => {
    mockState.clients.length = 0;
    mockState.mode = "get429ThenOk";
  });

  it("retries GET after 429 and succeeds", async () => {
    const result = await cloudflareService.listAccounts({
      authType: "globalApiKey",
      email: "user@example.com",
      globalApiKey: "key",
    });

    expect(result).toEqual([{ id: "acc_1", name: "Account One" }]);

    const firstClient = mockState.clients[0];
    expect(firstClient.__state.getCalls).toBe(2);
    expect(firstClient.__state.requestCalls).toBe(1);
  });

  it("does not retry POST on 429", async () => {
    mockState.mode = "post429";

    await expect(
      cloudflareService.createZone(
        {
          authType: "globalApiKey",
          email: "user@example.com",
          globalApiKey: "key",
        },
        "example.com",
        "acc_1",
      ),
    ).rejects.toBeInstanceOf(CloudflareError);

    const firstClient = mockState.clients[0];
    expect(firstClient.__state.postCalls).toBe(1);
    expect(firstClient.__state.requestCalls).toBe(0);
  });
});
