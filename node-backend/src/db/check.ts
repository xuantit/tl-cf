/**
 * DB connection & schema check.
 * Usage: npm run db:check
 *
 * Verifies the DATABASE_URL connects and reports which expected tables exist.
 */
import "dotenv/config";

import { sql } from "drizzle-orm";

import { db, pool } from "../services/db.js";

const EXPECTED_TABLES = [
  "User",
  "PendingRegistration",
  "RegistrationMailQuota",
  "Session",
  "CloudflareAccount",
  "Domain",
  "Tag",
  "TagRule",
  "DnsTemplate",
  "InviteCode",
  "AuditLog",
  "BulkJob",
  "ChangeSet",
  "ChangeItem",
];

async function main() {
  const started = Date.now();

  // 1) Connectivity
  await db.execute(sql`select 1`);
  console.log(`✓ Connected to database (${Date.now() - started}ms)`);

  // 2) Table presence
  const rows = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public'`,
  );
  const present = new Set(rows.rows.map((r) => r.table_name));

  console.log(`\nTables (public schema): ${present.size} found`);
  let missing = 0;
  for (const table of EXPECTED_TABLES) {
    const ok = present.has(table);
    if (!ok) missing++;
    console.log(`  ${ok ? "✓" : "✗"} ${table}`);
  }

  if (missing > 0) {
    console.error(`\n✗ ${missing} expected table(s) missing. Run: npm run db:migrate`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ Schema looks complete.`);
  }
}

main()
  .catch((error) => {
    console.error("✗ DB check failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
