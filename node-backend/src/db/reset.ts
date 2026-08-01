/**
 * DANGER: wipes ALL data from every table (schema is kept).
 * Usage: npm run db:reset -- --yes
 *
 * Truncates all application tables so you can re-seed a clean dataset.
 * Refuses to run against NODE_ENV=production and requires the --yes flag.
 */
import "dotenv/config";

import { sql } from "drizzle-orm";

import { db, pool } from "../services/db.js";

const TABLES = [
  "ChangeItem",
  "ChangeSet",
  "BulkJob",
  "AuditLog",
  "InviteCode",
  "DnsTemplate",
  "TagRule",
  "Tag",
  "Domain",
  "CloudflareAccount",
  "Session",
  "User",
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("✗ Refusing to reset the database while NODE_ENV=production.");
    process.exitCode = 1;
    return;
  }
  if (!process.argv.includes("--yes")) {
    console.error("✗ This deletes ALL data. Re-run with: npm run db:reset -- --yes");
    process.exitCode = 1;
    return;
  }

  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
  console.log(`✓ Truncated ${TABLES.length} tables.`);
}

main()
  .catch((error) => {
    console.error("✗ Reset failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
