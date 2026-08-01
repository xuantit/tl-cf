import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "../db/schema.js";
import { env } from "../utils/env.js";

const globalForDb = globalThis as unknown as {
  pgPool: pg.Pool | undefined;
};

export const pool =
  globalForDb.pgPool ??
  new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });

export { schema };
