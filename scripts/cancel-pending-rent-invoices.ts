/* eslint-disable no-console */
/**
 * Cancel pending/overdue rent invoices for a billing month (or all months).
 *
 * Usage:
 *   npx tsx scripts/cancel-pending-rent-invoices.ts [YYYY-MM-01]
 *   npx tsx scripts/cancel-pending-rent-invoices.ts --all
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('../src/db/client');
  const { cancelPendingRentInvoicesForMonth } = await import('../src/services/rentInvoices');

  const arg = process.argv[2];
  const today = new Date();
  const defaultMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const before = await db.execute<{ month: string; status: string; n: number }>(sql`
    SELECT billing_month::text AS month, status, count(*)::int AS n
    FROM rent_invoices
    WHERE status IN ('pending', 'overdue')
    GROUP BY billing_month, status
    ORDER BY billing_month DESC, status
  `);
  console.log('Before — pending/overdue by month:');
  console.table(Array.from(before));

  let totalCancelled = 0;
  const allErrors: string[] = [];

  if (arg === '--all') {
    const months = await db.execute<{ month: string }>(sql`
      SELECT DISTINCT billing_month::text AS month
      FROM rent_invoices
      WHERE status IN ('pending', 'overdue')
      ORDER BY month DESC
    `);
    for (const { month } of Array.from(months)) {
      const result = await cancelPendingRentInvoicesForMonth(
        month,
        'Admin undo accidental bulk rent generation',
      );
      totalCancelled += result.cancelled;
      allErrors.push(...result.errors);
      console.log(`Cancelled for ${month}:`, result);
    }
  } else {
    const billingMonth = arg ?? defaultMonth;
    const result = await cancelPendingRentInvoicesForMonth(
      billingMonth,
      'Admin undo accidental bulk rent generation',
    );
    totalCancelled += result.cancelled;
    allErrors.push(...result.errors);
    console.log(`Cancelled for ${billingMonth}:`, result);
  }

  console.log(`Total cancelled: ${totalCancelled}`);
  if (allErrors.length > 0) console.log('Errors:', allErrors);

  const after = await db.execute<{ month: string; status: string; n: number }>(sql`
    SELECT billing_month::text AS month, status, count(*)::int AS n
    FROM rent_invoices
    WHERE status IN ('pending', 'overdue')
    GROUP BY billing_month, status
    ORDER BY billing_month DESC, status
  `);
  console.log('After — pending/overdue by month:');
  console.table(Array.from(after));

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
