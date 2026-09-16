import { Router } from "express";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import {
  getZonesAnalytics,
  isAnalyticsPermissionError,
  summarize,
  type AnalyticsRange,
} from "../services/analytics.js";
import { cloudflareService, isCloudflareError } from "../services/cloudflare.js";
import { sendApiError } from "../utils/apiError.js";
import { getCredentials } from "./cf.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

const MAX_ZONES_PER_SUMMARY = 50;

function parseRange(value: unknown): AnalyticsRange {
  return value === "7d" || value === "30d" ? value : "24h";
}

function sendPermissionError(res: any, error: unknown) {
  return res.status(403).json({
    code: "ANALYTICS_PERMISSION_MISSING",
    detail:
      "The Cloudflare API token is missing the permission required for analytics. Edit the token and add Zone → Analytics → Read.",
    retryable: false,
    requiredPermission: "Zone Analytics:Read",
    planRequirement: null,
    cf: isCloudflareError(error)
      ? { status: error.status ?? 403, errors: error.cfErrors }
      : null,
  });
}

function buildAccountKey(userId: string, accountId?: string, label?: string): string {
  return `${userId}:${accountId ?? label ?? "default"}`;
}

analyticsRouter.get("/summary", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const range = parseRange(req.query.range);

  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const zones = await cloudflareService.listZones(credentials);
    const limitedZones = zones.slice(0, MAX_ZONES_PER_SUMMARY);

    const zoneNames: Record<string, string> = {};
    for (const zone of limitedZones) {
      zoneNames[zone.id] = zone.name;
    }

    const accountKey = buildAccountKey(auth.userId, accountId, label);
    const perZone = await getZonesAnalytics(
      credentials,
      limitedZones.map((zone) => zone.id),
      range,
      accountKey,
    );

    const summary = summarize(perZone, zoneNames);
    res.json({ ...summary, zoneCount: zones.length, range });
  } catch (error) {
    if (isAnalyticsPermissionError(error)) {
      return sendPermissionError(res, error);
    }
    sendApiError(res, error, {
      status: 502,
      code: "ANALYTICS_FETCH_FAILED",
      detail: "Failed to fetch analytics from Cloudflare",
    });
  }
});

analyticsRouter.get("/zone/:zoneId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const range = parseRange(req.query.range);
  const zoneId = req.params.zoneId;

  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const accountKey = buildAccountKey(auth.userId, accountId, label);
    const perZone = await getZonesAnalytics(credentials, [zoneId], range, accountKey);
    const zone = perZone[0];

    const requests = zone?.totals.requests ?? 0;
    const cachedRequests = zone?.totals.cachedRequests ?? 0;
    const { statusBuckets, topCountries } = summarize(perZone, {});

    res.json({
      totals: {
        requests,
        bytes: zone?.totals.bytes ?? 0,
        cachedRequests,
        cacheHitRatio: requests > 0 ? cachedRequests / requests : 0,
        savedBytes: zone?.totals.cachedBytes ?? 0,
      },
      series: zone?.series ?? [],
      statusBuckets,
      topCountries,
      range,
    });
  } catch (error) {
    if (isAnalyticsPermissionError(error)) {
      return sendPermissionError(res, error);
    }
    sendApiError(res, error, {
      status: 502,
      code: "ANALYTICS_FETCH_FAILED",
      detail: "Failed to fetch zone analytics from Cloudflare",
    });
  }
});
