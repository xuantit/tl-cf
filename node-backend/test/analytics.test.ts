import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { clearAnalyticsCache } from "../src/services/analytics.js";
import { CloudflareError, cloudflareService, type Zone } from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { prisma } from "../src/services/db.js";
import { encrypt } from "../src/utils/encryption.js";

const email = `analytics-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = "AnalyticsPass123";

let userId: string;
let accountId: string;
let token: string;

function makeZones(count: number): Zone[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `zone-${i + 1}`,
    name: `example-${i + 1}.com`,
    status: "active",
  }));
}

/** GraphQL response: each zone gets one hourly group with fixed numbers. */
function gqlResponse(zoneTags: string[]) {
  return {
    viewer: {
      zones: zoneTags.map((tag) => ({
        zoneTag: tag,
        httpRequests1hGroups: [
          {
            dimensions: { datetime: "2026-07-28T00:00:00Z" },
            sum: {
              requests: 100,
              bytes: 1000,
              cachedRequests: 80,
              cachedBytes: 600,
              responseStatusMap: [
                { edgeResponseStatus: 200, requests: 90 },
                { edgeResponseStatus: 301, requests: 4 },
                { edgeResponseStatus: 404, requests: 4 },
                { edgeResponseStatus: 502, requests: 2 },
              ],
              countryMap: [
                { clientCountryName: "US", requests: 60, bytes: 700 },
                { clientCountryName: "VN", requests: 40, bytes: 300 },
              ],
            },
          },
        ],
      })),
    },
  };
}

function mockGraphqlOk() {
  return vi
    .spyOn(cloudflareService, "queryGraphql")
    .mockImplementation(async (_creds, _query, variables) =>
      gqlResponse((variables as { zoneTags: string[] }).zoneTags),
    );
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "user" },
  });
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `analytics-test-${Date.now()}`,
    globalApiKeyEncrypted: encrypt("dummy-analytics-token"),
  });
  accountId = account.id;

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await prisma.cloudflareAccount.deleteMany({ where: { id: accountId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

beforeEach(() => {
  clearAnalyticsCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/analytics/summary", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/analytics/summary");
    expect(res.status).toBe(401);
  });

  it("aggregates totals, cacheHitRatio, statusBuckets, topZones and topCountries", async () => {
    vi.spyOn(cloudflareService, "listZones").mockResolvedValue(makeZones(2));
    mockGraphqlOk();

    const res = await request(app)
      .get(`/api/analytics/summary?accountId=${accountId}&range=24h`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.range).toBe("24h");
    expect(res.body.zoneCount).toBe(2);
    expect(res.body.totals).toEqual({
      requests: 200,
      bytes: 2000,
      cachedRequests: 160,
      cacheHitRatio: 0.8,
      savedBytes: 1200,
    });
    expect(res.body.statusBuckets).toEqual({ "2xx": 180, "3xx": 8, "4xx": 8, "5xx": 4 });
    expect(res.body.series).toEqual([
      { ts: "2026-07-28T00:00:00Z", requests: 200, bytes: 2000, cachedRequests: 160, cachedBytes: 1200 },
    ]);
    expect(res.body.topZones).toHaveLength(2);
    expect(res.body.topZones[0]).toEqual({
      zoneTag: "zone-1",
      name: "example-1.com",
      requests: 100,
      bytes: 1000,
    });
    expect(res.body.topCountries).toEqual([
      { country: "US", requests: 120 },
      { country: "VN", requests: 80 },
    ]);
  });

  it("chunks more than 10 zones into multiple GraphQL queries", async () => {
    vi.spyOn(cloudflareService, "listZones").mockResolvedValue(makeZones(12));
    const gqlSpy = mockGraphqlOk();

    const res = await request(app)
      .get(`/api/analytics/summary?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totals.requests).toBe(1200);
    expect(gqlSpy).toHaveBeenCalledTimes(2);
    expect((gqlSpy.mock.calls[0][2] as { zoneTags: string[] }).zoneTags).toHaveLength(10);
    expect((gqlSpy.mock.calls[1][2] as { zoneTags: string[] }).zoneTags).toHaveLength(2);
  });

  it("serves the second request within 60s from cache without re-querying GraphQL", async () => {
    vi.spyOn(cloudflareService, "listZones").mockResolvedValue(makeZones(2));
    const gqlSpy = mockGraphqlOk();

    const first = await request(app)
      .get(`/api/analytics/summary?accountId=${accountId}&range=7d`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(gqlSpy).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .get(`/api/analytics/summary?accountId=${accountId}&range=7d`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(gqlSpy).toHaveBeenCalledTimes(1);
    expect(second.body.totals).toEqual(first.body.totals);
  });

  it("maps GraphQL permission errors to 403 ANALYTICS_PERMISSION_MISSING", async () => {
    vi.spyOn(cloudflareService, "listZones").mockResolvedValue(makeZones(1));
    vi.spyOn(cloudflareService, "queryGraphql").mockRejectedValue(
      new CloudflareError({
        message: "zone not authorized to access this data",
        status: 403,
        retryable: false,
        cfErrors: [{ message: "zone not authorized to access this data" }],
      }),
    );

    const res = await request(app)
      .get(`/api/analytics/summary?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ANALYTICS_PERMISSION_MISSING");
    expect(res.body.requiredPermission).toBe("Zone Analytics:Read");
    expect(res.body.detail).toContain("Analytics");
  });

  it("returns an empty summary when the account has no zones", async () => {
    vi.spyOn(cloudflareService, "listZones").mockResolvedValue([]);
    const gqlSpy = mockGraphqlOk();

    const res = await request(app)
      .get(`/api/analytics/summary?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.zoneCount).toBe(0);
    expect(res.body.totals.requests).toBe(0);
    expect(res.body.totals.cacheHitRatio).toBe(0);
    expect(res.body.series).toEqual([]);
    expect(gqlSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/analytics/zone/:zoneId", () => {
  it("returns single-zone totals and series", async () => {
    mockGraphqlOk();

    const res = await request(app)
      .get(`/api/analytics/zone/zone-9?accountId=${accountId}&range=24h`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({
      requests: 100,
      bytes: 1000,
      cachedRequests: 80,
      cacheHitRatio: 0.8,
      savedBytes: 600,
    });
    expect(res.body.series).toEqual([
      { ts: "2026-07-28T00:00:00Z", requests: 100, bytes: 1000, cachedRequests: 80, cachedBytes: 600 },
    ]);
    expect(res.body.range).toBe("24h");
  });

  it("maps permission errors to 403 ANALYTICS_PERMISSION_MISSING", async () => {
    vi.spyOn(cloudflareService, "queryGraphql").mockRejectedValue(
      new CloudflareError({
        message: "unauthorized to access requested resource",
        status: 403,
        retryable: false,
        cfErrors: [{ message: "unauthorized to access requested resource" }],
      }),
    );

    const res = await request(app)
      .get(`/api/analytics/zone/zone-9?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ANALYTICS_PERMISSION_MISSING");
  });
});
