/**
 * Idempotent database seed for local development & testing.
 * Usage: npm run db:seed
 *
 * Seeds:
 *   - An admin user (DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD).
 *   - A demo non-admin user (SEED_USER_EMAIL / SEED_USER_PASSWORD, defaults below).
 *   - A sample DNS template + tag rule owned by the admin (for UI/testing).
 *   - Optionally a Cloudflare account for the admin, if SEED_CF_* env vars are set.
 *
 * Re-running is safe: existing rows (matched by natural keys) are left untouched.
 */
import "dotenv/config";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { db, pool } from "../services/db.js";
import {
  cloudflareAccounts,
  dnsTemplates,
  tagRules,
  users,
  type UserRow,
} from "./schema.js";
import { encrypt } from "../utils/encryption.js";

const ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD ?? "Admin@123";
const DEMO_EMAIL = process.env.SEED_USER_EMAIL ?? "demo@example.com";
const DEMO_PASSWORD = process.env.SEED_USER_PASSWORD ?? "Demo@1234";

async function upsertUser(email: string, password: string, role: "admin" | "user"): Promise<UserRow> {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    console.log(`  = user ${email} already exists`);
    return existing;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const [row] = await db.insert(users).values({ email, passwordHash, role }).returning();
  console.log(`  + created ${role} user ${email}`);
  return row;
}

async function seedDnsTemplate(userId: string): Promise<void> {
  const name = "Basic Web (A + www)";
  const existing = await db.query.dnsTemplates.findFirst({
    where: and(eq(dnsTemplates.userId, userId), eq(dnsTemplates.name, name)),
  });
  if (existing) {
    console.log(`  = DNS template "${name}" already exists`);
    return;
  }
  const records = [
    { type: "A", name: "@", content: "192.0.2.1", ttl: 1, proxied: true },
    { type: "CNAME", name: "www", content: "@", ttl: 1, proxied: true },
  ];
  await db.insert(dnsTemplates).values({
    userId,
    name,
    description: "Sample template seeded for local testing",
    recordsJson: JSON.stringify(records),
  });
  console.log(`  + created DNS template "${name}"`);
}

async function seedTagRule(userId: string): Promise<void> {
  const existing = await db.query.tagRules.findFirst({
    where: and(eq(tagRules.userId, userId), eq(tagRules.tag, "demo")),
  });
  if (existing) {
    console.log(`  = tag rule for "demo" already exists`);
    return;
  }
  await db.insert(tagRules).values({
    userId,
    field: "name",
    op: "endsWith",
    value: ".dev",
    tag: "demo",
    enabled: true,
  });
  console.log(`  + created tag rule (name endsWith .dev → demo)`);
}

async function seedCloudflareAccount(userId: string): Promise<void> {
  const authType = (process.env.SEED_CF_AUTH_TYPE ?? "apiToken") as "apiToken" | "globalApiKey";
  const label = process.env.SEED_CF_LABEL ?? "Seeded account";
  const apiToken = process.env.SEED_CF_API_TOKEN;
  const email = process.env.SEED_CF_EMAIL;
  const globalApiKey = process.env.SEED_CF_GLOBAL_API_KEY;

  const secret = authType === "apiToken" ? apiToken : globalApiKey;
  if (!secret) {
    console.log(
      "  · skipped Cloudflare account (set SEED_CF_API_TOKEN, or SEED_CF_AUTH_TYPE=globalApiKey + SEED_CF_EMAIL + SEED_CF_GLOBAL_API_KEY)",
    );
    return;
  }

  const existing = await db.query.cloudflareAccounts.findFirst({
    where: and(eq(cloudflareAccounts.userId, userId), eq(cloudflareAccounts.label, label)),
  });
  if (existing) {
    console.log(`  = Cloudflare account "${label}" already exists`);
    return;
  }

  await db.insert(cloudflareAccounts).values({
    userId,
    label,
    authType,
    email: authType === "globalApiKey" ? email : undefined,
    credentialEncrypted: encrypt(secret),
    isActive: true,
  });
  console.log(`  + created Cloudflare account "${label}" (${authType})`);
}

async function main() {
  console.log("Seeding database…");

  const admin = await upsertUser(ADMIN_EMAIL, ADMIN_PASSWORD, "admin");
  await upsertUser(DEMO_EMAIL, DEMO_PASSWORD, "user");
  await seedDnsTemplate(admin.id);
  await seedTagRule(admin.id);
  await seedCloudflareAccount(admin.id);

  console.log("\n✓ Seed complete.");
  console.log(`  Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Demo login:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("✗ Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
