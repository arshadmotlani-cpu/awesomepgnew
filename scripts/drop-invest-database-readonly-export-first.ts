/**
 * Drop all objects in INVEST (Capital) Neon database after schema inventory.
 * Requires INVEST_DATABASE_URL. Run only after archival export exists.
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import postgres from 'postgres';

async function main() {
  const url =
    process.env.INVEST_DATABASE_URL?.trim() ||
    process.env.INVEST_DATABASE_DATABASE_URL?.trim();
  if (!url) {
    console.error('INVEST_DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log(`Tables before drop: ${tables.length}`);
  for (const { tablename } of tables) {
    console.log(`  - ${tablename}`);
  }

  if (tables.length === 0) {
    console.log('Nothing to drop.');
    await sql.end();
    return;
  }

  await sql.unsafe('DROP SCHEMA public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO public');

  const after = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  console.log(`Tables after drop: ${after.length}`);
  await sql.end();
  console.log('INVEST database public schema reset complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
