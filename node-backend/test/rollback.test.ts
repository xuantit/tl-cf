import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/cloudflare.js", () => {
  return {
    cloudflareService: {
      updateDnsRecord: vi.fn(async () => ({ id: "rec_1" })),
      createDnsRecord: vi.fn(async () => ({ id: "rec_new" })),
      deleteDnsRecord: vi.fn(async () => undefined),
      updateSslMode: vi.fn(async () => ({ mode: "full" })),
      updateCacheSettings: vi.fn(async () => ({ cache_level: "aggressive" })),
    },
  };
});

import { cloudflareService } from "../src/services/cloudflare.js";
import { executeDnsRollback } from "../src/services/rollback.js";

const credentials = { authType: "apiToken" as const, apiToken: "token" };

const beforeRecord = {
  id: "rec_1",
  type: "A",
  name: "example.com",
  content: "1.1.1.1",
  ttl: 3600,
  proxied: false,
};

describe("executeDnsRollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores updated record to previous state", async () => {
    const results = await executeDnsRollback(
      {
        zoneId: "zone_1",
        items: [
          {
            resourceType: "dns_record",
            resourceId: "rec_1",
            before: beforeRecord,
            after: { ...beforeRecord, content: "2.2.2.2" },
          },
        ],
      },
      credentials,
    );

    expect(cloudflareService.updateDnsRecord).toHaveBeenCalledWith(credentials, "zone_1", "rec_1", {
      type: "A",
      name: "example.com",
      content: "1.1.1.1",
      ttl: 3600,
      proxied: false,
      priority: undefined,
    });
    expect(results).toEqual([
      { resourceType: "dns_record", resourceId: "rec_1", action: "restore", status: "success" },
    ]);
  });

  it("recreates a deleted record", async () => {
    const results = await executeDnsRollback(
      {
        zoneId: "zone_1",
        items: [
          {
            resourceType: "dns_record",
            resourceId: "rec_1",
            before: beforeRecord,
            after: undefined,
          },
        ],
      },
      credentials,
    );

    expect(cloudflareService.createDnsRecord).toHaveBeenCalledTimes(1);
    expect(results[0]).toEqual({
      resourceType: "dns_record",
      resourceId: "rec_1",
      action: "recreate",
      status: "success",
    });
  });

  it("deletes a created record", async () => {
    const results = await executeDnsRollback(
      {
        zoneId: "zone_1",
        items: [
          {
            resourceType: "dns_record",
            resourceId: "rec_new",
            before: undefined,
            after: { ...beforeRecord, id: "rec_new" },
          },
        ],
      },
      credentials,
    );

    expect(cloudflareService.deleteDnsRecord).toHaveBeenCalledWith(credentials, "zone_1", "rec_new");
    expect(results[0]).toEqual({
      resourceType: "dns_record",
      resourceId: "rec_new",
      action: "delete_created",
      status: "success",
    });
  });

  it("marks operation as error when Cloudflare call fails", async () => {
    (cloudflareService.deleteDnsRecord as any).mockRejectedValueOnce(new Error("boom"));

    const results = await executeDnsRollback(
      {
        zoneId: "zone_1",
        items: [
          {
            resourceType: "dns_record",
            resourceId: "rec_new",
            before: undefined,
            after: { ...beforeRecord, id: "rec_new" },
          },
        ],
      },
      credentials,
    );

    expect(results[0]).toEqual({
      resourceType: "dns_record",
      resourceId: "rec_new",
      action: "error",
      status: "error",
      error: "boom",
    });
  });

  it("skips items when zoneId is missing", async () => {
    const results = await executeDnsRollback(
      {
        zoneId: null,
        items: [
          {
            resourceType: "dns_record",
            resourceId: "rec_1",
            before: beforeRecord,
            after: undefined,
          },
        ],
      },
      credentials,
    );

    expect(cloudflareService.createDnsRecord).not.toHaveBeenCalled();
    expect(results[0].status).toBe("skipped");
    expect(results[0].error).toBe("Missing zoneId");
  });

  it("restores previous SSL mode", async () => {
    const results = await executeDnsRollback(
      {
        zoneId: "zone_1",
        items: [
          {
            resourceType: "zone_setting_ssl",
            resourceId: "zone_1",
            before: { mode: "flexible" },
            after: { mode: "full" },
          },
        ],
      },
      credentials,
    );

    expect(cloudflareService.updateSslMode).toHaveBeenCalledWith(credentials, "zone_1", "flexible");
    expect(results[0]).toEqual({
      resourceType: "zone_setting_ssl",
      resourceId: "zone_1",
      action: "restore",
      status: "success",
    });
  });

  it("skips SSL rollback when previous mode is missing", async () => {
    const results = await executeDnsRollback(
      {
        zoneId: "zone_1",
        items: [
          {
            resourceType: "zone_setting_ssl",
            resourceId: "zone_1",
            before: undefined,
            after: { mode: "full" },
          },
        ],
      },
      credentials,
    );

    expect(cloudflareService.updateSslMode).not.toHaveBeenCalled();
    expect(results[0].status).toBe("skipped");
  });

  it("restores previous cache settings", async () => {
    const results = await executeDnsRollback(
      {
        zoneId: "zone_1",
        items: [
          {
            resourceType: "zone_cache_config",
            resourceId: "zone_1",
            before: { cache_level: "basic", browser_cache_ttl: 1800 },
            after: { cache_level: "aggressive" },
          },
        ],
      },
      credentials,
    );

    expect(cloudflareService.updateCacheSettings).toHaveBeenCalledWith(credentials, "zone_1", {
      cache_level: "basic",
      browser_cache_ttl: 1800,
      tiered_cache_topology: undefined,
    });
    expect(results[0]).toEqual({
      resourceType: "zone_cache_config",
      resourceId: "zone_1",
      action: "restore",
      status: "success",
    });
  });
});
