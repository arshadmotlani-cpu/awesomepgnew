#!/usr/bin/env npx tsx
/**
 * Forensic trace: room electricity period → collections → checkout attribution.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/audit-electricity-room-period-forensic-readonly.ts \\
 *     --room-id <uuid> --billing-month 2026-09-01
 *
 * Optional meter proof:
 *   --previous 337 --current 479 --rate-inr 16
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('electricity-forensic');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { paiseToInr } from '@/src/lib/format';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { listRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import { loadRoomElectricityCollectedByCustomerForMonth } from '@/src/services/electricityRoomContributions';
import { firstOfMonth } from '@/src/services/billing';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const roomId = arg('--room-id');
  const billingMonth = firstOfMonth(arg('--billing-month') ?? '2026-09-01');
  if (!roomId) {
    console.error('Usage: --room-id <uuid> [--billing-month YYYY-MM-01]');
    process.exit(1);
  }

  const prev = arg('--previous');
  const cur = arg('--current');
  const rateInr = arg('--rate-inr');

  const [room] = await db.execute<{ room_number: string; pg_name: string }>(sql`
    SELECT r.room_number, p.name AS pg_name
    FROM rooms r
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE r.id = ${roomId}::uuid
    LIMIT 1
  `);

  console.log('\n=== Electricity forensic ===');
  console.log('PG:', room?.pg_name ?? '?', 'Room:', room?.room_number ?? roomId);
  console.log('Billing month:', billingMonth);

  if (prev && cur && rateInr) {
    const units = Number(cur) - Number(prev);
    const gross = Math.round(units * Number(rateInr) * 100);
    console.log('\nMeter proof:', prev, '→', cur, '=', units, 'units @ ₹', rateInr);
    console.log('Computed room total:', paiseToInr(gross));
  }

  const ledger = await getElectricitySettlementLedgerView({ roomId, billingMonth });
  if (!ledger) {
    console.log('\nNo ledger view for this room/month.');
  } else {
    console.log('\n--- Ledger SSOT ---');
    console.log('Gross room bill:', paiseToInr(ledger.totalRoomBillPaise));
    console.log('Collected (room):', paiseToInr(ledger.collectedPaise));
    console.log('Outstanding:', paiseToInr(ledger.outstandingPaise));
    console.log('Balanced:', ledger.isBalanced, 'gap:', paiseToInr(ledger.reconciliationGapPaise));

    console.log('\nCheckout settlement credits:');
    for (const c of ledger.checkoutSettlementCredits) {
      console.log(
        `  ${c.customerName} (${c.customerId.slice(0, 8)}…): ${paiseToInr(c.amountPaise)} @ ${c.collectedAt.toISOString().slice(0, 10)}`,
      );
    }

    console.log('\nManual / historical contributions:');
    for (const c of ledger.manualCredits) {
      console.log(
        `  ${c.customerName}: ${paiseToInr(c.amountPaise)} source=${c.source} note=${c.note ?? '—'}`,
      );
    }

    console.log('\nResident allocations (invoices):');
    for (const a of ledger.residentAllocations) {
      console.log(
        `  ${a.customerName}: owed ${paiseToInr(a.amountPaise)} paid ${paiseToInr(a.paidPaise)} excludedCheckout=${a.excludedBecauseCheckoutPaid}`,
      );
    }
  }

  const contributionsLoad = await loadRoomElectricityContributionsForMonth(roomId, billingMonth);
  console.log('\n--- Contributions SSOT (raw rows) ---');
  for (const row of contributionsLoad.contributions) {
    console.log(
      JSON.stringify({
        customerName: row.customerName,
        customerId: row.customerId,
        amountInr: paiseToInr(row.amountPaise),
        kind: row.kind,
        contributionDate: row.contributionDate,
        checkoutSettlementId: row.checkoutSettlementId,
        reason: row.reason,
      }),
    );
  }
  console.log('Sum by customer (contributions map):', Object.fromEntries(contributionsLoad.byCustomerId));

  const collectedMap = await loadRoomElectricityCollectedByCustomerForMonth(roomId, billingMonth);
  let sum = 0;
  console.log('\n--- Merged collected-by-customer (checkout allocation input) ---');
  for (const [customerId, amount] of collectedMap) {
    sum += amount;
    const [name] = await db.execute<{ full_name: string }>(sql`
      SELECT full_name FROM customers WHERE id = ${customerId}::uuid LIMIT 1
    `);
    console.log(`  ${name?.full_name ?? customerId}: ${paiseToInr(amount)}`);
  }
  console.log('TOTAL merged collected:', paiseToInr(sum));

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
