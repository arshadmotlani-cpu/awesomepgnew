/* eslint-disable no-console */
/**
 * Repair partial express walk-in (missing rent invoice / unified mirror).
 *
 * Usage:
 *   npx tsx scripts/repair-express-walk-in.ts APG-2026-0032
 *   npx tsx scripts/repair-express-walk-in.ts APG-2026-0032 --execute
 *   npx tsx scripts/repair-express-walk-in.ts --customer=Dhruv --execute
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.vercel.dhruv') });
config({ path: resolve(process.cwd(), '.env') });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const execute = process.argv.includes('--execute');
  const bookingCode = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
  const customer = arg('customer');

  const { closeDb, db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { repairExpressWalkInTransaction } = await import('../src/services/expressWalkInRepair');

  let code = bookingCode;
  if (!code && customer) {
    const [row] = await db.execute<{ booking_code: string }>(sql`
      SELECT b.booking_code
      FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      WHERE c.full_name ILIKE ${'%' + customer + '%'}
        AND b.created_via = 'admin'
        AND b.status = 'confirmed'
      ORDER BY b.created_at DESC
      LIMIT 1
    `);
    code = row?.booking_code;
  }

  if (!code) {
    console.error('Usage: npx tsx scripts/repair-express-walk-in.ts <bookingCode> [--execute]');
    process.exit(1);
  }

  console.log(`\n=== Express walk-in repair: ${code} (${execute ? 'EXECUTE' : 'dry-run'}) ===\n`);

  const result = await repairExpressWalkInTransaction({
    bookingCode: code,
    execute,
    cancelDuplicateBookings: true,
  });

  console.log(JSON.stringify(result, null, 2));
  await closeDb();

  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
