import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Router-only coverage: no app bootstrap, DB, Cloudflare, or real credentials.
const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  getAccountById: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("../src/services/db.js", () => ({
  db: new Proxy({}, { get() { throw new Error("DB forbidden in export route tests"); } }),
}));
vi.mock("axios", () => ({ default: { create: () => { throw new Error("Network forbidden in export route tests"); } } }));
vi.mock("../src/services/cloudflare.js", () => ({
  cloudflareService: {},
  isCloudflareError: () => false,
}));
vi.mock("../src/utils/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../src/utils/logger.js", () => ({
  default: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../src/services/configService.js", () => ({
  configService: { loadConfig: mocks.loadConfig, getAccountById: mocks.getAccountById },
}));
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth(req: Request, res: Response, next: NextFunction) {
    const role = req.header("authorization")?.replace(/^Bearer /, "");
    if (!role) return res.status(401).json({ detail: "Missing token" });
    req.auth = { userId: "requester", email: "requester@example.com", role };
    return next();
  },
}));

import { cfRouter } from "../src/routes/cf.js";

const app = express();
app.use("/api/cf", cfRouter);
const config = {
  version: "1.0",
  users: Array.from({ length: 6 }, (_, index) => ({
    id: `user-${index}`, email: `user-${index}@example.com`, role: "user",
    passwordHash: `private-password-hash-${index}`,
  })),
  accounts: Array.from({ length: 6 }, (_, index) => ({
    id: `account-${index}`, authType: index % 2 === 0 ? "apiToken" : "globalApiKey",
    globalApiKeyEncrypted: `private-credential-ciphertext-${index}`,
    domains: [{ id: `domain-${index}`, name: `example-${index}.com`, settings: { tags: ["production"] } }],
  })),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadConfig.mockResolvedValue(config);
  mocks.getAccountById.mockResolvedValue(null);
});

describe.each(["/accounts/export", "/config/export"])("GET /api/cf%s", (path) => {
  it("requires authentication without reading config", async () => {
    const response = await request(app).get(`/api/cf${path}`);
    expect(response.status).toBe(401);
    expect(mocks.loadConfig).not.toHaveBeenCalled();
  });

  it.each(["", "?includeSecrets=true"])("rejects non-admin export%s before loading data", async (query) => {
    const response = await request(app).get(`/api/cf${path}${query}`).set("Authorization", "Bearer user");
    expect(response.status).toBe(403);
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.getAccountById).not.toHaveBeenCalled();
  });

  it.each(["", "?includeSecrets=false", "?includeSecrets=1", "?includeSecrets=TRUE"])(
    "redacts admin export%s without truncating or mutating config", async (query) => {
      const original = JSON.stringify(config);
      const response = await request(app).get(`/api/cf${path}${query}`).set("Authorization", "Bearer admin");
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toEqual({
        ...config,
        users: config.users.map((user) => ({ ...user, passwordHash: "[REDACTED]" })),
        accounts: config.accounts.map((account) => ({ ...account, globalApiKeyEncrypted: "[REDACTED]" })),
      });
      expect(response.text).not.toContain("private-password-hash");
      expect(response.text).not.toContain("private-credential-ciphertext");
      expect(JSON.stringify(config)).toBe(original);
      expect(mocks.getAccountById).not.toHaveBeenCalled();
      expect(mocks.warn).not.toHaveBeenCalled();
    },
  );

  it("requires explicit admin opt-in for a full backup and logs no secrets", async () => {
    const response = await request(app).get(`/api/cf${path}?includeSecrets=true`).set("Authorization", "Bearer admin");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual(config);
    expect(mocks.warn).toHaveBeenCalledWith("Full config export WITH secrets", {
      adminId: "requester", ip: expect.any(String),
    });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("private-");
    expect(mocks.getAccountById).not.toHaveBeenCalled();
  });

  it("does not expose config-loading errors in the response", async () => {
    mocks.loadConfig.mockRejectedValueOnce(new Error("private-database-error"));
    const response = await request(app).get(`/api/cf${path}`).set("Authorization", "Bearer admin");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ detail: "Failed to export config" });
    expect(response.text).not.toContain("private-database-error");
  });
});