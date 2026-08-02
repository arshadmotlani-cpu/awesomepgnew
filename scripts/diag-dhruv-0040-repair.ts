/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('diag-dhruv-0040-repair');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getCustomerDepositCredit } from '@/src/services/depositCredit';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';

const CUST = '3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c';
const BOOKING_0040 = '70debd82-4c80-4fd7-a368-0cd7c40f7fbd';
const DUP_BOOKING = '90d7e2ca-363e-4144-b64b-14096ae2203c';
const PENDING_RECORD = '150bc21b-8058-491c-be98-3772a9e06470';
const KRISHNA_0048 = '34e5149a-86ac-4c52-8ebc-83af7be6a042';

async function main() {
  console.log('=== Dhruv 0040 repair diagnostic ===\n');

  for (const [label, id] of [
    ['0040', BOOKING_0040],
    ['duplicate', DUP_BOOKING],
  ] as const) {
    const [b] = await db.execute(sql`
      SELECT booking_code, status, stay_type, duration_mode, subtotal_paise, deposit_paise,
             deposit_collection_status, deposit_due_paise, rent_received_paise, pricing_snapshot, created_via
      FROM bookings WHERE id = ${id}
    `);
    const [br] = await db.execute(sql`
      SELECT br.status, bd.bed_code, r.room_number, br.stay_range::text
      FROM bed_reservations br
      JOIN beds bd ON bd.id = br.bed_id JOIN rooms r ON r.id = bd.room_id
      WHERE br.booking_id = ${id} AND br.kind = 'primary'
    `);
    console.log(label, b, br[0] ?? 'no reservation');
    if (b) {
      const snap = (b as { pricing_snapshot: { depositCredit?: unknown } }).pricing_snapshot;
      console.log('  depositCredit:', snap?.depositCredit);
      const breakdown = breakdownBookingCheckoutPayment({
        subtotalPaise: Number((b as { subtotal_paise: string }).subtotal_paise),
        discountPaise: 0,
        depositPaise: Number((b as { deposit_paise: string }).deposit_paise),
        pricingSnapshot: snap,
      });
      console.log('  checkout breakdown:', breakdown);
    }
  }

  const pg = await db.execute(sql`
    SELECT id, status, amount_paise, booking_id, proof_snapshot_checkout_total_paise,
           proof_snapshot_rent_due_paise, proof_snapshot_deposit_due_paise, created_at
    FROM pg_payment_records WHERE customer_id = ${CUST} ORDER BY created_at DESC
  `);
  console.log('\nPG records:', pg);

  const dep = await db.execute(sql`
    SELECT booking_id, entry_kind, amount_paise, reason FROM deposit_ledger
    WHERE customer_id = ${CUST} ORDER BY created_at
  `);
  console.log('\nDeposit ledger:', dep);

  const rent = await db.execute(sql`
    SELECT booking_id, invoice_number, status, rent_paise, paid_principal_paise, billing_month
    FROM rent_invoices WHERE booking_id IN (${BOOKING_0040}, ${DUP_BOOKING}, ${KRISHNA_0048})
  `);
  console.log('\nRent invoices:', rent);

  const elec = await db.execute(sql`
    SELECT b.booking_code, ei.invoice_number, ei.amount_paise, ei.paid_paise, ei.status, c.full_name
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    LEFT JOIN bookings b ON b.id = ei.booking_id
    WHERE ei.billing_month = '2026-07-01'
      AND (b.id IN (${BOOKING_0040}, ${KRISHNA_0048}) OR c.id = ${CUST})
    ORDER BY c.full_name
  `);
  console.log('\nJuly elec (Dhruv/Krishna):', elec);

  const room102 = await db.execute(sql`
    SELECT c.full_name, ei.invoice_number, ei.amount_paise, ei.paid_paise, ei.status, b.booking_code
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    LEFT JOIN bookings b ON b.id = ei.booking_id
    JOIN rooms r ON r.id = ei.room_id
    WHERE r.room_number = '102' AND ei.billing_month = '2026-07-01' AND ei.status <> 'cancelled'
    ORDER BY c.full_name
  `);
  console.log('\nRoom 102 July all:', room102);

  const bill = await db.execute(sql`
    SELECT eb.id, eb.billing_month, eb.total_paise, eb.monthly_occupant_count, r.room_number
    FROM electricity_bills eb JOIN rooms r ON r.id = eb.room_id
    WHERE r.room_number = '102' AND eb.billing_month = '2026-07-01'
  `);
  console.log('\nRoom 102 bill:', bill[0]);

  const bal = await getBookingMoneyBalances(BOOKING_0040);
  console.log('\n0040 balances:', bal);
  console.log('Wallet:', await getCustomerDepositCredit(CUST));
  const fin = await getResidentFinancialAccount(CUST);
  console.log('RFE deposit:', fin?.deposit);
  console.log(
    'RFE outstanding items:',
    fin?.outstandingItems?.map((i) => ({
      label: i.label,
      outstanding: i.outstandingPaise,
      kind: i.kind,
    })),
  );

  const [pending] = await db.execute(sql`
    SELECT * FROM pg_payment_records WHERE id = ${PENDING_RECORD}
  `);
  console.log('\nPending record booking matches dup?', (pending as { booking_id: string })?.booking_id === DUP_BOOKING);

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
