import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../src/db/schema.js';

const client = new PGlite();
const journal = JSON.parse(await readFile(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8')) as { entries: { tag: string }[] };
for (const entry of journal.entries) {
  const sql = await readFile(new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8');
  await client.exec(sql);
}

export const db = drizzle(client, { schema });
export { schema };
export const pool = { end: () => client.close() };