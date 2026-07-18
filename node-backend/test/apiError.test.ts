import { describe, expect, it } from "vitest";

import { CloudflareError } from "../src/services/cloudflare.js";
import { apiErrorEnvelope } from "../src/utils/apiError.js";

describe("apiErrorEnvelope", () => {
  it("maps CloudflareError to normalized envelope", () => {
    const error = new CloudflareError({
      message: "Rate limited",
      status: 429,
      retryAfter: 7,
      retryable: true,
      cfErrors: [{ code: 10000, message: "rate limit" }],
    });

    const result = apiErrorEnvelope(error, "FALLBACK", "Fallback detail");

    expect(result).toEqual({
      code: "CLOUDFLARE_RATE_LIMITED",
      detail: "Rate limited",
      retryable: true,
      retryAfter: 7,
      requiredPermission: null,
      planRequirement: null,
      cf: {
        status: 429,
        errors: [{ code: 10000, message: "rate limit" }],
      },
    });
  });

  it("maps generic Error to fallback envelope", () => {
    const result = apiErrorEnvelope(new Error("boom"), "DOMAIN_CREATE_FAILED", "Failed to create domain");

    expect(result).toEqual({
      code: "DOMAIN_CREATE_FAILED",
      detail: "boom",
      retryable: false,
      retryAfter: undefined,
      requiredPermission: null,
      planRequirement: null,
      cf: null,
    });
  });
});
