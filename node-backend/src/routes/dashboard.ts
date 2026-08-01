import { Router } from "express";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { DomainSettingsSchema } from "../models/configAccount.js";
import { cloudflareService, type Zone } from "../services/cloudflare.js";
import { prisma } from "../services/db.js";
import { sendApiError } from "../utils/apiError.js";
import { getCredentials } from "./cf.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

const ZONE_CACHE_TTL_MS = 60_000;

interface ZoneCacheEntry {
  zones: Zone[];
  fetchedAt: number;
}

const zoneCache = new Map<string, ZoneCacheEntry>();

export function clearDashboardCache(): void {
  zoneCache.clear();
}

function buildAccountKey(userId: string, accountId?: string, label?: string): string {
  return `${userId}:${accountId ?? label ?? "default"}`;
}

// Shared 60s zone cache; also reused by the tag-rule preview endpoint (routes/tags.ts)
export async function getZonesCached(
  userId: string,
  accountId?: string,
  label?: string,
): Promise<Zone[]> {
  const key = buildAccountKey(userId, accountId, label);
  const cached = zoneCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ZONE_CACHE_TTL_MS) {
    return cached.zones;
  }
  const credentials = await getCredentials(userId, accountId, label);
  const zones = await cloudflareService.listZones(credentials);
  zoneCache.set(key, { zones, fetchedAt: Date.now() });
  return zones;
}

function parseSslMode(settingsJson: string | null): string | undefined {
  if (!settingsJson) return undefined;
  try {
    const parsed = DomainSettingsSchema.safeParse(JSON.parse(settingsJson));
    return parsed.success ? parsed.data.sslMode : undefined;
  } catch {
    return undefined;
  }
}

dashboardRouter.get("/summary", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [zones, domainRows, accountRows, recentChangeRows, jobsAggregate] = await Promise.all([
      getZonesCached(auth.userId, accountId, label),
      prisma.domain.findMany({
        where: { account: { userId: auth.userId, ...(accountId ? { id: accountId } : {}) } },
        select: { settingsJson: true },
      }),
      prisma.cloudflareAccount.findMany({
        where: { userId: auth.userId },
        select: {
          id: true,
          label: true,
          authType: true,
          isActive: true,
          _count: { select: { domains: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.changeSet.findMany({
        where: { ownerId: auth.userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          action: true,
          status: true,
          zoneId: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
      prisma.bulkJob.aggregate({
        where: { ownerId: auth.userId, createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
        _sum: { succeeded: true, failed: true },
      }),
    ]);

    // Zone status breakdown
    let active = 0;
    let pending = 0;
    let moved = 0;
    let other = 0;
    const planCounts = new Map<string, number>();
    for (const zone of zones) {
      switch (zone.status) {
        case "active":
          active += 1;
          break;
        case "pending":
          pending += 1;
          break;
        case "moved":
          moved += 1;
          break;
        default:
          other += 1;
      }
      const plan = zone.plan ?? "unknown";
      planCounts.set(plan, (planCounts.get(plan) ?? 0) + 1);
    }

    // sslOff from locally saved DomainSettings
    let sslOff = 0;
    for (const row of domainRows) {
      if (parseSslMode(row.settingsJson) === "off") sslOff += 1;
    }

    res.json({
      zones: { total: zones.length, active, pending, moved, other, sslOff },
      planDistribution: Array.from(planCounts.entries())
        .map(([plan, count]) => ({ plan, count }))
        .sort((a, b) => b.count - a.count),
      attention: {
        pendingNs: pending,
        sslOff,
        // Development mode is not persisted in DomainSettings, so we cannot derive it locally.
        devMode: 0,
      },
      recentChanges: recentChangeRows.map((change) => ({
        id: change.id,
        action: change.action,
        status: change.status,
        zoneId: change.zoneId,
        createdAt: change.createdAt,
        itemCount: change._count.items,
      })),
      jobs7d: {
        total: jobsAggregate._count._all,
        succeeded: jobsAggregate._sum.succeeded ?? 0,
        failed: jobsAggregate._sum.failed ?? 0,
      },
      accounts: accountRows.map((account) => ({
        id: account.id,
        label: account.label,
        authType: account.authType,
        isActive: account.isActive,
        domainCount: account._count.domains,
      })),
    });
  } catch (error) {
    sendApiError(res, error, {
      status: 502,
      code: "DASHBOARD_SUMMARY_FAILED",
      detail: "Failed to build dashboard summary",
    });
  }
});
