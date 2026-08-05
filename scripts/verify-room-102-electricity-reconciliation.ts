#!/usr/bin/env npx tsx
/**
 * Room 102 July 2026 electricity reconciliation report.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-room-102-electricity-reconciliation.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-room-102-electricity');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { paiseToInr } from '@/src/lib/format';
import { buildRoomElectricitySettlementSnapshot } from '@/src/roomOs/engines/electricity/buildRoomElectricitySettlement';
import { buildResidentElectricityAccount } from '@/src/lib/residents/residentElectricityAccount';

const ROOM_ID = 'cd562fa7-14c4-46f2-a87c-4f07078e42d6';
const JULY = '2026-07-01';

const RESIDENTS = [
  { name: 'Kunal', bookingCode: 'checkout credit only' },
  { name: 'Krishna', bookingCode: 'APG-2026-0048', bookingId: '34e5149a-86ac-4c52-8ebc-83af7be6a042' },
  { name: 'Dhruv', bookingCode: 'APG-2026-0040', bookingId: '70debd82-4c80-4fd7-a368-0cd7c40f7fbd' },
  { name: 'Ameen', bookingCode: 'TBD' },
];

async function main() {
  const roomSettlement = await buildRoomElectricitySettlementSnapshot({
    roomId: ROOM_ID,
    billingMonth: JULY,
  });

  console.log('\n=== ROOM 102 — July 2026 Room Brain Settlement ===\n');
  if (!roomSettlement) {
    console.log('No settlement snapshot');
    await closeDb();
    return;
  }

  console.log('Total room bill (gross):', paiseToInr(roomSettlement.grossRoomBillPaise));
  console.log('Checkout credits:', paiseToInr(roomSettlement.checkoutCreditsPaise));
  console.log('Net splittable:', paiseToInr(roomSettlement.totalRoomBillPaise));
  console.log('Already collected:', paiseToInr(roomSettlement.alreadyCollectedPaise));
  console.log('From deposits:', paiseToInr(roomSettlement.collectedFromDepositsPaise));
  console.log('Pending collection:', paiseToInr(roomSettlement.pendingCollectionPaise));
  console.log('Balanced:', roomSettlement.isBalanced);
  console.log('Gap:', paiseToInr(roomSettlement.reconciliationGapPaise));

  console.log('\n| Resident | Owed | Paid | Deposit deduct | Outstanding | Late fee | Status |');
  console.log('|----------|------|------|----------------|-------------|----------|--------|');

  for (const r of RESIDENTS) {
    if (!r.bookingId) {
      if (r.name === 'Kunal') {
        console.log(
          `| Kunal (checkout credit) | — | ${paiseToInr(roomSettlement.checkoutCreditsPaise)} recovered | ${paiseToInr(roomSettlement.checkoutCreditsPaise)} | 0 | 0 | settled via deposit |`,
        );
      } else {
        const ameen = await db.execute(sql`
          SELECT b.id, b.booking_code, c.full_name
          FROM bed_reservations br
          JOIN bookings b ON b.id = br.booking_id
          JOIN customers c ON c.id = b.customer_id
          JOIN beds bd ON bd.id = br.bed_id
          WHERE bd.room_id = ${ROOM_ID}::uuid
            AND c.full_name ILIKE '%ameen%'
            AND br.status = 'active'
          LIMIT 1
        `);
        if (ameen[0]) {
          const row = ameen[0] as { id: string; booking_code: string; full_name: string };
          const acct = await buildResidentElectricityAccount(row.id);
          console.log(
            `| ${row.full_name} | ${paiseToInr(acct.electricityDuePaise)} | ${paiseToInr(acct.electricityPaidPaise)} | ${paiseToInr(acct.electricityDeductedFromDepositPaise)} | ${paiseToInr(acct.netOutstandingPaise)} | ${paiseToInr(acct.lateFeePaise)}${acct.lateFeeWaived ? ' (waived)' : ''} | ${acct.netOutstandingPaise > 0 ? 'pending' : 'clear'} |`,
          );
        } else {
          console.log(`| Ameen | — | — | — | — | — | not in room July |`);
        }
      }
      continue;
    }
    const acct = await buildResidentElectricityAccount(r.bookingId);
    console.log(
      `| ${r.name} (${r.bookingCode}) | ${paiseToInr(acct.electricityDuePaise)} | ${paiseToInr(acct.electricityPaidPaise)} | ${paiseToInr(acct.electricityDeductedFromDepositPaise)} | ${paiseToInr(acct.netOutstandingPaise)} | ${paiseToInr(acct.lateFeePaise)}${acct.lateFeeWaived ? ' (waived)' : ''} | ${acct.netOutstandingPaise > 0 ? 'pending' : 'settled'} |`,
    );
  }

  const sumOwed = roomSettlement.residentsSettled
    .concat(roomSettlement.residentsPending)
    .reduce((s, r) => s + r.amountOwedPaise, 0);
  const sumPaid = roomSettlement.residentsSettled
    .concat(roomSettlement.residentsPending)
    .reduce((s, r) => s + r.amountPaidPaise, 0);

  console.log('\n=== Ledger balance check ===');
  console.log('Sum resident allocations:', paiseToInr(sumOwed), 'paid', paiseToInr(sumPaid));
  console.log(
    'Room net + credits =',
    paiseToInr(roomSettlement.grossRoomBillPaise),
    '− checkout',
    paiseToInr(roomSettlement.checkoutCreditsPaise),
    '=',
    paiseToInr(roomSettlement.grossRoomBillPaise - roomSettlement.checkoutCreditsPaise),
  );

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
