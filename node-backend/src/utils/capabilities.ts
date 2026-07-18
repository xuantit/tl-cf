import { isCloudflareError } from "../services/cloudflare.js";

export type FeatureState = "available" | "forbidden" | "plan_limited" | "unavailable" | "unknown";

export function featureFromCloudflareError(error: unknown, requiredPermission: string) {
  if (!isCloudflareError(error)) {
    return { state: "unknown" as FeatureState, requiredPermission, reason: "probe failed" };
  }
  if (error.status === 403) {
    return { state: "forbidden" as FeatureState, requiredPermission, reason: "missing permission" };
  }
  if (error.status === 404) {
    return { state: "unavailable" as FeatureState, requiredPermission, reason: "resource unavailable" };
  }
  if (error.message.toLowerCase().includes("plan")) {
    return { state: "plan_limited" as FeatureState, requiredPermission, reason: error.message };
  }
  return { state: "unknown" as FeatureState, requiredPermission, reason: error.message };
}
