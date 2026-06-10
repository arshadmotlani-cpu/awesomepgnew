import 'dotenv/config';
import { createClient } from './client';

/**
 * Drops the public schema and recreates it. Used in dev to start clean.
 * NEVER point this at production.
 */
async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_RESET !== 'true') {
    console.error('✗ Refusing to run db:reset in production without ALLOW_PROD_RESET=true');
    process.exit(1);
  }
  const { sql, close } = createClient({ max: 1 });
  console.log('→ Dropping public schema …');
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  console.log('✓ Schema reset. Run `npm run db:migrate` next.');
  await close();
}

main().catch((err) => {
  console.error('✗ Reset failed:', err);
  process.exit(1);
});
