/**
 * One-time migration: import legacy JSON config (config/accounts.json)
 * into the SQLite database via Prisma.
 *
 * Safe to run multiple times: it only imports when the database is empty,
 * unless --force is passed (which replaces all existing data).
 *
 * Usage:
 *   npm run migrate:json
 *   npm run migrate:json -- --force
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { prisma } from "../services/db.js";
import { configService } from "../services/configService.js";
import { ConfigFileSchema } from "../models/configAccount.js";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, "../../config/accounts.json");

async function main() {
  const force = process.argv.includes("--force");

  const raw = await fs.readFile(CONFIG_FILE, "utf-8").catch(() => null);
  if (!raw) {
    logger.warn("No legacy config file found, nothing to migrate", { path: CONFIG_FILE });
    return;
  }

  const parsed = JSON.parse(raw);
  if (!parsed.users) parsed.users = [];
  const config = ConfigFileSchema.parse(parsed);

  const [userCount, accountCount] = await Promise.all([
    prisma.user.count(),
    prisma.cloudflareAccount.count(),
  ]);

  if ((userCount > 0 || accountCount > 0) && !force) {
    logger.warn("Database already contains data. Use --force to overwrite.", {
      userCount,
      accountCount,
    });
    return;
  }

  await configService.setConfig(config);

  const domainTotal = config.accounts.reduce((sum, acc) => sum + (acc.domains?.length || 0), 0);
  logger.info("Migration complete", {
    users: config.users.length,
    accounts: config.accounts.length,
    domains: domainTotal,
  });
}

main()
  .catch((error) => {
    logger.error("Migration failed", { error: error.message, stack: error.stack });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
