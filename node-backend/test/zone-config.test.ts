import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { app } from "../src/app.js";
import { cloudflareService, type DnsRecord } from "../src/services/cloudflare.js";
import { substituteHostname } from "../src/services/zoneConfig.js";
import { configService } from "../src/services/configService.js";
import { db } from "../src/services/db.js";
import { bulkJobs, changeSets, cloudflareAccounts, users } from "../src/db/schema.js";
import { encrypt } from "../src/utils/encryption.js";

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `zone-config-test-${run}@example.com`;
const password = "ZoneConfigPass123";

let userId: string;
let accountId: string;
let token: string;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, role: "user" }).returning();
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `zone-config-test-${run}`,
    globalApiKeyEncrypted: encrypt("dummy-zone-config-token"),
  });
  accountId = account.id;

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await db.delete(changeSets).where(eq(changeSets.ownerId, userId));
  await db.delete(bulkJobs).where(eq(bulkJobs.ownerId, userId));
  await db.delete(cloudflareAccounts).where(eq(cloudflareAccounts.id, accountId));
  await db.delete(users).where(eq(users.id, userId));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("substituteHostname", () => {
  it("replaces the bare zone name", () => {
    expect(substituteHostname("source.com", "source.com", "target.com")).toBe("target.com");
  });

  it("replaces subdomain occurrences in record names", () => {
    expect(substituteHostname("www.source.com", "source.com", "target.com")).toBe("www.target.com");
  });

  it("replaces occurrences inside record content and URLs", () => {
    expect(
      substituteHostname("https://cdn.source.com/path?x=source.com", "source.com", "target.com"),
    ).toBe("https://cdn.target.com/path?x=target.com");
  });

  it("replaces occurrences inside rule expressions", () => {
    expect(
      substituteHostname('http.host eq "source.com" or http.host eq "www.source.com"', "source.com", "target.com"),
    ).toBe('http.host eq "target.com" or http.host eq "www.target.com"');
  });

  it("is case-insensitive", () => {
    expect(substituteHostname("WWW.Source.COM", "source.com", "target.com")).toBe("WWW.target.com");
  });

  it("does not mangle unrelated domains that merely end with the source zone", () => {
    // "notsource.com" is preceded by a hostname-label char, so it must stay untouched.
    expect(substituteHostname("notsource.com", "source.com", "target.com")).toBe("notsource.com");
    expect(substituteHostname("a.notsource.com and source.com", "source.com", "target.com")).toBe(
      "a.notsource.com and target.com",
    );
  });

  it("does not replace when the match is followed by a hostname-label char", () => {
    expect(substituteHostname("source.community", "source.com", "target.com")).toBe("source.community");
  });
});

describe("POST /api/domains/copy-config", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/domains/copy-config").send({});
    expect(res.status).toBe(401);
  });

  it("rejects an empty components list", async () => {
    const res = await request(app)
      .post(`/api/domains/copy-config?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        sourceZoneId: "zone-src",
        sourceZoneName: "source.com",
        targets: [{ zoneId: "zone-tgt", zoneName: "target.com" }],
        components: [],
      });
    expect(res.status).toBe(400);
  });

  it("copies DNS records to the target zone via a background job", async () => {
    const sourceRecords: DnsRecord[] = [
      { id: "r1", type: "A", name: "www.source.com", content: "1.2.3.4", ttl: 300, proxied: true },
      { id: "r2", type: "CNAME", name: "app.source.com", content: "source.com", ttl: 1, proxied: false },
      { id: "r3", type: "NS", name: "source.com", content: "ns1.cloudflare.com", ttl: 1 },
    ];
    const targetRecords: DnsRecord[] = [
      // Conflicts with the source A record after substitution → skipped in dnsMode "skip"
      { id: "t1", type: "A", name: "www.target.com", content: "9.9.9.9", ttl: 300, proxied: false },
    ];

    vi.spyOn(cloudflareService, "listDnsRecords").mockImplementation(async (_credentials, zoneId) => {
      if (zoneId === "zone-src") return sourceRecords;
      if (zoneId === "zone-tgt") return targetRecords;
      throw new Error(`Unexpected zoneId ${zoneId}`);
    });
    const createSpy = vi
      .spyOn(cloudflareService, "createDnsRecord")
      .mockImplementation(async (_credentials, _zoneId, record) => ({ id: "new-1", ...record }));

    const res = await request(app)
      .post(`/api/domains/copy-config?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        sourceZoneId: "zone-src",
        sourceZoneName: "source.com",
        targets: [{ zoneId: "zone-tgt", zoneName: "target.com" }],
        components: ["dns"],
        dnsMode: "skip",
      });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeTruthy();

    // Poll the job until it finishes
    let job: any;
    for (let i = 0; i < 100; i++) {
      const jobRes = await request(app)
        .get(`/api/jobs/${res.body.jobId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(jobRes.status).toBe(200);
      job = jobRes.body;
      if (job.status === "done") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(job.status).toBe("done");
    expect(job.type).toBe("copy-config");
    expect(job.succeeded).toBe(1);
    expect(job.failed).toBe(0);
    expect(job.items[0].key).toBe("zone-tgt");
    expect(job.items[0].status).toBe("success");

    const steps = job.items[0].result.steps;
    expect(steps).toEqual([
      { step: "dns", status: "success", detail: "created 1, skipped 1, errors 0" },
    ]);

    // Only the non-conflicting, non-NS record was created — with hostnames substituted.
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(expect.anything(), "zone-tgt", {
      type: "CNAME",
      name: "app.target.com",
      content: "target.com",
      ttl: 1,
      proxied: false,
      priority: undefined,
    });
  });
});

describe("POST /api/domains/clone", () => {
  it("returns 400 for an invalid new domain name", async () => {
    const res = await request(app)
      .post(`/api/domains/clone?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        sourceZoneId: "zone-src",
        sourceZoneName: "source.com",
        newDomains: ["not a domain!"],
        components: ["dns"],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DOMAIN_VALIDATION_FAILED");
  });
});
