/* eslint-disable no-console */
/**
 * READ-ONLY final audit — Dhruv incident (0040 vs 0093).
 * Does NOT modify any data.
 *
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-dhruv-incident-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-dhruv-incident-readonly');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentCreditBalance } from '@/src/services/residentCreditLedger';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';
import { paiseToInr } from '@/src/lib/format';
import type { PricingSnapshot } from '@/src/db/schema/bookings';

const CUSTOMER_ID = '3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c';
const BOOKING_0040_ID = '70debd82-4c80-4fd7-a368-0cd7c40f7fbd';
const BOOKING_0040_CODE = 'APG-2026-0040';
const BOOKING_0093_ID = '90d7e2ca-363e-4144-b64b-14096ae2203c';
const BOOKING_0093_CODE = 'APG-2026-0093';

type Finding = { area: string; severity: 'ok' | 'warn' | 'fail'; detail: string };

const findings: Finding[] = [];

function ok(area: string, detail: string) {
  findings.push({ area, severity: 'ok', detail });
}
function warn(area: string, detail: string) {
  findings.push({ area, severity: 'warn', detail });
}
function fail(area: string, detail: string) {
  findings.push({ area, severity: 'fail', detail });
}

async function countByBooking(table: string, bookingCol = 'booking_id'): Promise<Map<string, number>> {
  const rows = await db.execute(sql.raw(`
    SELECT ${bookingCol}::text AS bid, count(*)::int AS c
    FROM ${table}
    WHERE ${bookingCol} IN ('${BOOKING_0040_ID}', '${BOOKING_0093_ID}')
    GROUP BY ${bookingCol}
  `));
  const m = new Map<string, number>();
  for (const r of rows as Array<{ bid: string | null; c: number }>) {
    if (r.bid) m.set(r.bid, r.c);
  }
  return m;
}

async function customerScoped(table: string, extra = ''): Promise<Record<string, unknown>[]> {
  return db.execute(sql.raw(`
    SELECT * FROM ${table}
    WHERE customer_id = '${CUSTOMER_ID}' ${extra}
    ORDER BY created_at NULLS LAST
    LIMIT 50
  `)) as Promise<Record<string, unknown>[]>;
}

async function main() {
  console.log('=== Dhruv incident READ-ONLY audit ===\n');
  console.log('Customer:', CUSTOMER_ID);
  console.log('0040:', BOOKING_0040_ID);
  console.log('0093:', BOOKING_0093_ID);

  // ── Bookings ──
  const bookings = await db.execute(sql`
    SELECT id, booking_code, status, created_via, deposit_collection_status,
           deposit_due_paise, rent_received_paise, created_at, updated_at
    FROM bookings
    WHERE id IN (${BOOKING_0040_ID}, ${BOOKING_0093_ID})
       OR customer_id = ${CUSTOMER_ID}
    ORDER BY booking_code
  `);
  console.log('\n--- bookings ---');
  for (const b of bookings) {
    console.log(b);
  }
  const b0040 = bookings.find((b) => (b as { id: string }).id === BOOKING_0040_ID);
  const b0093 = bookings.find((b) => (b as { id: string }).id === BOOKING_0093_ID);
  if (!b0040) fail('booking', '0040 missing');
  else if ((b0040 as { status: string }).status !== 'confirmed') {
    fail('booking', `0040 status ${(b0040 as { status: string }).status} (expect confirmed)`);
  } else ok('booking', '0040 confirmed — canonical');

  if (!b0093) warn('booking', '0093 row absent');
  else if ((b0093 as { status: string }).status === 'superseded') {
    ok('booking', '0093 superseded (historical only)');
  } else {
    fail('booking', `0093 status ${(b0093 as { status: string }).status} (expect superseded)`);
  }

  const activeBookings = bookings.filter(
    (b) => !['superseded', 'cancelled', 'rejected'].includes((b as { status: string }).status),
  );
  if (activeBookings.length === 1 && (activeBookings[0] as { id: string }).id === BOOKING_0040_ID) {
    ok('booking', 'Single active booking for customer');
  } else {
    fail('booking', `Active bookings: ${activeBookings.length} — ${JSON.stringify(activeBookings.map((b) => (b as { booking_code: string }).booking_code))}`);
  }

  // ── Reservations / occupancy ──
  const reservations = await db.execute(sql`
    SELECT br.id, br.booking_id, b.booking_code, br.kind, br.status, br.stay_range::text,
           bd.bed_code, r.room_number
    FROM bed_reservations br
    JOIN bookings b ON b.id = br.booking_id
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    WHERE b.customer_id = ${CUSTOMER_ID}
    ORDER BY br.created_at
  `);
  console.log('\n--- bed_reservations ---');
  for (const r of reservations) console.log(r);

  const activeRes = reservations.filter((r) =>
    ['active', 'under_review', 'pending'].includes((r as { status: string }).status),
  );
  const active0040 = activeRes.filter((r) => (r as { booking_id: string }).booking_id === BOOKING_0040_ID);
  const active0093 = activeRes.filter((r) => (r as { booking_id: string }).booking_id === BOOKING_0093_ID);

  if (active0040.length === 1 && active0093.length === 0) {
    ok('reservation', 'Single active reservation on 0040');
  } else {
    fail('reservation', `active 0040=${active0040.length} active 0093=${active0093.length}`);
  }

  const cancelled0093 = reservations.filter(
    (r) =>
      (r as { booking_id: string }).booking_id === BOOKING_0093_ID &&
      (r as { status: string }).status === 'cancelled',
  );
  if (cancelled0093.length >= 1) ok('reservation', '0093 reservation cancelled');
  else warn('reservation', 'No cancelled 0093 reservation found');

  // ── Residency / customer ──
  const [customer] = await db.execute(sql`
    SELECT id, full_name, email, residency_status
    FROM customers WHERE id = ${CUSTOMER_ID}
  `);
  console.log('\n--- customer ---', customer);
  if (customer) {
    ok('residency', `residency_status=${(customer as { residency_status: string }).residency_status}`);
  }

  // ── Payment proofs ──
  const pgRecords = await db.execute(sql`
    SELECT p.id, p.booking_id, b.booking_code, p.status, p.amount_paise, p.confirmed_amount_paise,
           p.proof_snapshot_checkout_total_paise, p.created_at, p.reviewed_at
    FROM pg_payment_records p
    LEFT JOIN bookings b ON b.id = p.booking_id
    WHERE p.customer_id = ${CUSTOMER_ID}
    ORDER BY p.created_at
  `);
  console.log('\n--- pg_payment_records ---');
  for (const p of pgRecords) console.log(p);

  const pendingPg = pgRecords.filter((p) => (p as { status: string }).status === 'pending');
  const pgOn0093 = pgRecords.filter((p) => (p as { booking_id: string }).booking_id === BOOKING_0093_ID);
  const pgOn0040 = pgRecords.filter((p) => (p as { booking_id: string }).booking_id === BOOKING_0040_ID);

  if (pendingPg.length === 0) ok('payment proofs', 'No pending PG records');
  else fail('payment proofs', `${pendingPg.length} pending records`);

  if (pgOn0093.length === 0) ok('payment proofs', 'No proofs linked to 0093');
  else fail('payment proofs', `${pgOn0093.length} proofs still on 0093`);

  if (pgOn0040.length > 0) ok('payment proofs', `${pgOn0040.length} proof(s) on 0040`);

  // ── Payments ──
  const payments = await db.execute(sql`
    SELECT p.id, p.booking_id, b.booking_code, p.purpose, p.amount_paise, p.status,
           p.provider_payment_id, p.paid_at
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    WHERE b.customer_id = ${CUSTOMER_ID}
    ORDER BY p.paid_at NULLS LAST, p.created_at
  `);
  console.log('\n--- payments ---');
  for (const p of payments) console.log(p);

  const pay0093 = payments.filter((p) => (p as { booking_id: string }).booking_id === BOOKING_0093_ID);
  const pay0040 = payments.filter((p) => (p as { booking_id: string }).booking_id === BOOKING_0040_ID);
  if (pay0093.length === 0) ok('payments', 'No payments on 0093');
  else fail('payments', `${pay0093.length} payments on 0093`);
  ok('payments', `${pay0040.length} payment rows on 0040`);

  // ── Payment allocations ──
  const allocations = await db.execute(sql`
    SELECT entity_type, entity_id, booking_id, b.booking_code,
           room_charges_paid_paise, security_deposit_paid_paise,
           electricity_paid_paise, other_paid_paise, total_amount_received_paise,
           allocation_notes, approved_at
    FROM payment_approval_allocations a
    LEFT JOIN bookings b ON b.id = a.booking_id
    WHERE a.customer_id = ${CUSTOMER_ID}
    ORDER BY a.approved_at DESC
  `);
  console.log('\n--- payment_approval_allocations ---');
  for (const a of allocations) console.log(a);

  const alloc0093 = allocations.filter((a) => (a as { booking_id: string }).booking_id === BOOKING_0093_ID);
  if (alloc0093.length === 0) ok('payment allocations', 'None on 0093');
  else fail('payment allocations', `${alloc0093.length} on 0093`);

  // ── Rent invoices ──
  const rentInv = await db.execute(sql`
    SELECT ri.id, b.booking_code, ri.invoice_number, ri.billing_month, ri.status,
           ri.rent_paise, ri.paid_principal_paise, ri.is_adhoc
    FROM rent_invoices ri
    JOIN bookings b ON b.id = ri.booking_id
    WHERE b.customer_id = ${CUSTOMER_ID}
    ORDER BY ri.billing_month, b.booking_code
  `);
  console.log('\n--- rent_invoices ---');
  for (const r of rentInv) console.log(r);

  const rent0093 = rentInv.filter((r) => (r as { booking_code: string }).booking_code === BOOKING_0093_CODE);
  const rent0040Active = rentInv.filter(
    (r) =>
      (r as { booking_code: string }).booking_code === BOOKING_0040_CODE &&
      (r as { status: string }).status !== 'cancelled',
  );
  if (rent0093.length === 0) ok('invoices (rent)', 'No rent invoices on 0093');
  else warn('invoices (rent)', `${rent0093.length} rent invoice(s) on 0093 — check cancelled`);

  const dupMonths = new Map<string, number>();
  for (const r of rent0040Active) {
    const m = String((r as { billing_month: string }).billing_month);
    dupMonths.set(m, (dupMonths.get(m) ?? 0) + 1);
  }
  const rentDups = [...dupMonths.entries()].filter(([, c]) => c > 1);
  if (rentDups.length === 0) ok('invoices (rent)', 'No duplicate billing months on 0040');
  else fail('invoices (rent)', `Duplicate months on 0040: ${JSON.stringify(rentDups)}`);

  // ── Electricity ──
  const elecInv = await db.execute(sql`
    SELECT ei.id, b.booking_code, ei.invoice_number, ei.billing_month, ei.status,
           ei.amount_paise, ei.paid_paise
    FROM electricity_invoices ei
    LEFT JOIN bookings b ON b.id = ei.booking_id
    WHERE ei.customer_id = ${CUSTOMER_ID}
    ORDER BY ei.billing_month, b.booking_code
  `);
  console.log('\n--- electricity_invoices ---');
  for (const e of elecInv) console.log(e);

  const elec0093 = elecInv.filter((e) => (e as { booking_code: string | null }).booking_code === BOOKING_0093_CODE);
  if (elec0093.length === 0) ok('electricity invoices', 'None on 0093');
  else fail('electricity invoices', `${elec0093.length} on 0093`);

  // ── Deposit ledger ──
  const depLedger = await db.execute(sql`
    SELECT dl.booking_id, b.booking_code, dl.entry_kind, dl.amount_paise, dl.reason, dl.created_at
    FROM deposit_ledger dl
    JOIN bookings b ON b.id = dl.booking_id
    WHERE dl.customer_id = ${CUSTOMER_ID}
    ORDER BY dl.created_at
  `);
  console.log('\n--- deposit_ledger ---');
  for (const d of depLedger) console.log(d);

  const dep0093 = depLedger.filter((d) => (d as { booking_id: string }).booking_id === BOOKING_0093_ID);
  if (dep0093.length === 0) ok('deposit ledger', 'No entries on 0093');
  else warn('deposit ledger', `${dep0093.length} historical entries on 0093`);

  // ── Resident credit ──
  const credit = await getResidentCreditBalance(CUSTOMER_ID);
  const creditRows = await db.execute(sql`
    SELECT booking_id, entry_kind, amount_paise, reason, created_at
    FROM resident_credit_ledger
    WHERE customer_id = ${CUSTOMER_ID}
    ORDER BY created_at
  `);
  console.log('\n--- resident_credit_ledger --- balance', paiseToInr(credit));
  for (const c of creditRows) console.log(c);

  const credit0093 = creditRows.filter((c) => (c as { booking_id: string }).booking_id === BOOKING_0093_ID);
  if (credit === 0) ok('resident credit ledger', 'Net balance ₹0');
  else fail('resident credit ledger', `Balance ${paiseToInr(credit)}`);
  if (credit0093.length === 0) ok('resident credit ledger', 'No 0093 booking_id rows');

  // ── Pricing snapshot / refund pending ──
  const [snapRow] = await db.execute(sql`
    SELECT pricing_snapshot FROM bookings WHERE id = ${BOOKING_0040_ID}
  `);
  const snap = (snapRow as { pricing_snapshot?: PricingSnapshot } | undefined)?.pricing_snapshot;
  const refundPending = (snap?.checkoutCredits ?? []).filter((c) => c.kind === 'refund_pending');
  console.log('\n--- checkoutCredits (0040) ---', refundPending);
  if (refundPending.length === 1) {
    ok('refund pending', `Single refund_pending ₹${refundPending[0]!.amountPaise / 100}`);
  } else if (refundPending.length === 0) {
    warn('refund pending', 'No refund_pending in snapshot');
  } else {
    warn('refund pending', `${refundPending.length} refund_pending entries`);
  }

  const snap0093Credits = await db.execute(sql`
    SELECT pricing_snapshot->'checkoutCredits' AS credits
    FROM bookings WHERE id = ${BOOKING_0093_ID}
  `);
  console.log('--- checkoutCredits (0093) ---', snap0093Credits[0]);

  // ── Checkout settlements ──
  const checkout = await db.execute(sql`
    SELECT cs.id, cs.booking_id, b.booking_code, cs.status, cs.final_refund_paise, cs.created_at
    FROM checkout_settlements cs
    JOIN bookings b ON b.id = cs.booking_id
    WHERE cs.customer_id = ${CUSTOMER_ID}
    ORDER BY cs.created_at DESC
  `);
  console.log('\n--- checkout_settlements ---');
  for (const c of checkout) console.log(c);
  const co0093 = checkout.filter((c) => (c as { booking_id: string }).booking_id === BOOKING_0093_ID);
  if (co0093.length === 0) ok('checkout', 'No settlements on 0093');
  else fail('checkout', `${co0093.length} settlements on 0093`);

  // ── Audit log (recent) ──
  const audit = await db.execute(sql`
    SELECT action, entity, entity_id, created_at,
           diff->>'duplicateSuperseded' AS dup,
           diff->>'paymentRecordId' AS pay_rec
    FROM audit_log
    WHERE (entity_id IN (${BOOKING_0040_ID}, ${BOOKING_0093_ID}, ${CUSTOMER_ID})
           OR diff::text ILIKE '%0093%' OR diff::text ILIKE '%0040%')
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log('\n--- audit_log (recent incident) ---');
  for (const a of audit) console.log(a);
  ok('audit log', `${audit.length} incident-related entries visible (historical trace)`);

  // ── Cross-table orphan scan for 0093 ──
  const tablesWithBooking = [
    'rent_invoices',
    'electricity_invoices',
    'payments',
    'pg_payment_records',
    'deposit_ledger',
    'bed_reservations',
    'checkout_settlements',
    'vacating_requests',
    'resident_billing_profiles',
    'payment_approval_allocations',
    'payment_links',
    'resident_credit_ledger',
    'financial_invoices',
    'action_items',
  ];

  console.log('\n--- 0093 row counts by table ---');
  for (const t of tablesWithBooking) {
    try {
      const counts = await countByBooking(t);
      const c93 = counts.get(BOOKING_0093_ID) ?? 0;
      const c40 = counts.get(BOOKING_0040_ID) ?? 0;
      console.log(`${t}: 0040=${c40} 0093=${c93}`);
      if (c93 > 0 && t !== 'bed_reservations') {
        const activeCheck = await db.execute(sql.raw(`
          SELECT count(*)::int AS c FROM ${t}
          WHERE booking_id = '${BOOKING_0093_ID}'
          AND (
            status IS NULL
            OR status NOT IN ('cancelled', 'superseded', 'rejected', 'completed', 'refund_paid')
          )
        `)).catch(() => null);
        if (activeCheck && (activeCheck[0] as { c: number }).c > 0) {
          fail('orphan scan', `${t}: ${(activeCheck[0] as { c: number }).c} non-terminal rows on 0093`);
        }
      }
    } catch {
      // table may lack booking_id or status
    }
  }

  // ── RFE / money balances (live SSOT readers) ──
  const bal0040 = await getBookingMoneyBalances(BOOKING_0040_ID);
  const dep0040 = await getDepositSummaryForBooking(BOOKING_0040_ID);
  const fin = await getResidentFinancialAccount(CUSTOMER_ID);

  console.log('\n--- live SSOT readers ---');
  console.log('0040 balances:', bal0040);
  console.log('0040 deposit:', dep0040);
  console.log(
    'RFE outstanding:',
    fin?.outstandingItems?.map((i) => ({ label: i.label, out: i.outstandingPaise, kind: i.kind })),
  );
  console.log('RFE deposit:', fin?.deposit);

  if (bal0040 && (bal0040.electricity.outstandingPaise ?? 0) === 0) {
    ok('RFE / balances', '0040 electricity outstanding ₹0');
  } else {
    fail('RFE / balances', `elec outstanding ${bal0040?.electricity.outstandingPaise}`);
  }

  // ── Active tenancy derivation ──
  const { getActiveTenancyForCustomer } = await import('@/src/lib/residentActiveTenancy');
  const tenancy = await getActiveTenancyForCustomer(CUSTOMER_ID);
  console.log('\n--- active tenancy SSOT ---', tenancy);
  if (tenancy?.bookingId === BOOKING_0040_ID) {
    ok('occupancy SSOT', 'Active tenancy → 0040');
  } else if (tenancy?.bookingCode === BOOKING_0040_CODE) {
    ok('occupancy SSOT', 'Active tenancy booking code → 0040');
  } else {
    fail('occupancy SSOT', `tenancy ${JSON.stringify(tenancy)}`);
  }

  // ── Summary ──
  console.log('\n\n========== FINDINGS ==========');
  const fails = findings.filter((f) => f.severity === 'fail');
  const warns = findings.filter((f) => f.severity === 'warn');
  const oks = findings.filter((f) => f.severity === 'ok');
  for (const f of [...fails, ...warns, ...oks]) {
    console.log(`[${f.severity.toUpperCase()}] ${f.area}: ${f.detail}`);
  }
  console.log(`\nTotal: ${oks.length} ok, ${warns.length} warn, ${fails.length} fail`);
  console.log(fails.length === 0 ? '\n✅ INCIDENT CLOSURE: PASS' : '\n❌ INCIDENT CLOSURE: ISSUES REMAIN');

  await closeDb();
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
