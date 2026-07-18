import { describe, expect, it } from "vitest";

import { CloudflareError } from "../src/services/cloudflare.js";
import { featureFromCloudflareError } from "../src/utils/capabilities.js";

describe("featureFromCloudflareError", () => {
  it("maps 403 to forbidden with permission hint", () => {
    const error = new CloudflareError({
      message: "Forbidden",
      status: 403,
      retryable: false,
      cfErrors: [{ code: 1001, message: "forbidden" }],
    });

    const result = featureFromCloudflareError(error, "DNS Write");

    expect(result).toEqual({
      state: "forbidden",
      requiredPermission: "DNS Write",
      reason: "missing permission",
    });
  });

  it("maps 404 to unavailable", () => {
    const error = new CloudflareError({
      message: "Not found",
      status: 404,
      retryable: false,
      cfErrors: [{ code: 1002, message: "not found" }],
    });

    const result = featureFromCloudflareError(error, "Cache Purge");

    expect(result).toEqual({
      state: "unavailable",
      requiredPermission: "Cache Purge",
      reason: "resource unavailable",
    });
  });

  it("maps plan-related message to plan_limited", () => {
    const error = new CloudflareError({
      message: "Plan does not include this feature",
      status: 400,
      retryable: false,
      cfErrors: [{ code: 1003, message: "plan limit" }],
    });

    const result = featureFromCloudflareError(error, "Cache Purge");

    expect(result).toEqual({
      state: "plan_limited",
      requiredPermission: "Cache Purge",
      reason: "Plan does not include this feature",
    });
  });

  it("maps unknown non-Cloudflare errors", () => {
    const result = featureFromCloudflareError(new Error("unexpected"), "DNS Write");

    expect(result).toEqual({
      state: "unknown",
      requiredPermission: "DNS Write",
      reason: "probe failed",
    });
  });
});
