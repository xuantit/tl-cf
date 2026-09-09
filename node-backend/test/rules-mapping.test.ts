import { describe, expect, it } from "vitest";

import { defaultActionForKind, rulePhaseForKind } from "../src/services/cloudflare.js";

describe("modern rules kind mapping", () => {
  it("maps kinds to Cloudflare ruleset phases", () => {
    expect(rulePhaseForKind("redirect")).toBe("http_request_dynamic_redirect");
    expect(rulePhaseForKind("cache")).toBe("http_request_cache_settings");
    expect(rulePhaseForKind("configuration")).toBe("http_config_settings");
    expect(rulePhaseForKind("security")).toBe("http_request_firewall_custom");
  });

  it("maps kinds to default actions", () => {
    expect(defaultActionForKind("redirect")).toBe("redirect");
    expect(defaultActionForKind("cache")).toBe("set_cache_settings");
    expect(defaultActionForKind("configuration")).toBe("set_config");
    expect(defaultActionForKind("security")).toBe("block");
  });
});
