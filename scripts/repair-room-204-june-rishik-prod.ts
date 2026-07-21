#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Production repair: Room 204 June 2026 electricity — Rishik Khobragade invoice.
 *
 *   export DATABASE_URL="$(node -e "...")"
 *   npx tsx scripts/repair-room-204-june-rishik-prod.ts           # audit
 *   npx tsx scripts/repair-room-204-june-rishik-prod.ts --execute # repair + verify
 */
import { and, eq, ilike, ne } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  customers,
  electricityBills,
  electricityInvoices,
  electricityRoomContributions,
  financialInvoices,
} from '../src/db/schema';
import { syncElectricityInvoiceToUnifiedInTx } from '../src/lib/billing/syncUnifiedInvoiceInTx';
import { createElectricityBill } from '../src/services/electricityBilling';
import {
  loadRoomElectricityContributionsForMonth,
  recordHistoricalElectricityContribution,
} from '../src/services/electricityRoomContributions';
import { allocateMonthlyElectricityInvoices } from '../src/lib/billing/roomElectricityMonthlyAllocation';
import { loadRoomElectricityOccupantsForMonth } from '../src/lib/billing/roomElectricityOccupants';
import { countActiveBedsInRoom } from '../src/lib/roomCapacitySsotDb';
import { listAdminElectricityInvoicesForReminders } from '../src/db/queries/admin';
import { getResidentFinancialSummary } from '../src/services/residentFinancialEngine';

const ROOM_ID = '1e925dd4-aee6-47a6-8727-5c49a6f72f18';
const BILLING_MONTH = '2026-06-01';
const PREVIOUS_READING = 654;
const CURRENT_READING = 841; // 187 units × ₹16 = ₹2,992 (matches Aatif checkout settlement)
const EXPECTED_GROSS_PAISE = 299_200;
const EXPECTED_RECOVERED_PAISE = 172_000;
const EXPECTED_REMAINING_PAISE = 127_200;
const EXPECTED_RISHIK_PAISE = 127_200;

const AATIF_BOOKING_ID = '8071b983-d3a0-406e-b1b0-5ccd7e7e2f14';
const AATIF_CUSTOMER_ID = 'eb9a4d56-54e2-43e1-8a48-5fda80d13b91';
const RISHIK_CUSTOMER_ID = '5ede7359-4bdc-4f2e-9aa4-f616b4f564f3';

const CONTRIBUTIONS = [
  {
    label: 'Resident A (Mohd Aatif Siddiqui · almost full month)',
    bookingId: AATIF_BOOKING_ID,
    customerId: AATIF_CUSTOMER_ID,
    amountPaise: 122_000,
    reason: 'Historical offline electricity payment — June 2026 (pre-system)',
  },
  {
    label: 'Resident B (short stay 1–10 Jun · offline)',
    bookingId: AATIF_BOOKING_ID,
    customerId: AATIF_CUSTOMER_ID,
    amountPaise: 50_000,
    reason: 'Historical offline electricity payment — short stay 1–10 Jun 2026',
  },
] as const;

const execute = process.argv.includes('--execute');
const syncFinancialOnly = process.argv.includes('--sync-financial');

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

async function printContributions() {
  const rows = await db
    .select({
      id: electricityRoomContributions.id,
      customerName: customers.fullName,
      bookingId: electricityRoomContributions.bookingId,
      amountPaise: electricityRoomContributions.amountPaise,
      kind: electricityRoomContributions.kind,
      reason: electricityRoomContributions.reason,
      contributionDate: electricityRoomContributions.contributionDate,
    })
    .from(electricityRoomContributions)
    .innerJoin(customers, eq(customers.id, electricityRoomContributions.customerId))
    .where(
      and(
        eq(electricityRoomContributions.roomId, ROOM_ID),
        eq(electricityRoomContributions.billingMonth, BILLING_MONTH),
      ),
    )
    .orderBy(electricityRoomContributions.contributionDate);

  console.log('\n=== electricity_room_contributions (Room 204 · June 2026) ===');
  if (rows.length === 0) {
    console.log('  (none)');
  } else {
    for (const r of rows) {
      console.log(
        `  ${r.customerName} · ${inr(r.amountPaise)} · ${r.kind} · ${r.reason ?? '—'} · booking ${r.bookingId}`,
      );
    }
  }
  return rows;
}

async function printJuneInvoices(billId: string) {
  const rows = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      status: electricityInvoices.status,
      amountPaise: electricityInvoices.amountPaise,
      customerName: customers.fullName,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(eq(electricityInvoices.electricityBillId, billId))
    .orderBy(customers.fullName);

  console.log('\n=== June 2026 electricity invoices (Room 204 bill) ===');
  for (const r of rows) {
    console.log(`  ${r.customerName} · ${r.invoiceNumber} · ${inr(r.amountPaise)} · status=${r.status}`);
  }
  return rows;
}

async function printOperationsAmount() {
  const res = await listAdminElectricityInvoicesForReminders();
  const row = res.ok
    ? res.data.find((r) => r.customerId === RISHIK_CUSTOMER_ID)
    : undefined;
  console.log('\n=== Operations Electricity Due (Rishik) ===');
  if (!row) {
    console.log('  NOT IN QUEUE');
    return null;
  }
  console.log(`  ${row.customerFullName} · June · ${inr(row.outstandingPaise)} (${row.invoiceNumber})`);
  return row;
}

function assertOrStop(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    console.error(`\nSTOP: ${label}`);
    console.error(`  Expected: ${inr(expected)} (${expected} paise)`);
    console.error(`  Actual:   ${inr(actual)} (${actual} paise)`);
    process.exit(1);
  }
  console.log(`  ✓ ${label}: ${inr(actual)}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim() && !process.env.POSTGRES_URL?.trim()) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  console.log('Target: SHANTINAGAR · Room 204 · June 2026');
  console.log(`Mode: ${execute ? 'EXECUTE' : 'AUDIT ONLY'}`);

  const existingContributions = await printContributions();

  const [bill] = await db
    .select({
      id: electricityBills.id,
      totalPaise: electricityBills.totalPaise,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
    })
    .from(electricityBills)
    .where(
      and(eq(electricityBills.roomId, ROOM_ID), eq(electricityBills.billingMonth, BILLING_MONTH)),
    )
    .limit(1);

  if (!bill) {
    console.error('\nSTOP: No June 2026 electricity bill for room 204');
    process.exit(1);
  }

  console.log(`\nGross room bill (DB): ${inr(bill.totalPaise)} (readings ${bill.previousReadingUnits}→${bill.currentReadingUnits})`);
  console.log(`Expected gross after repair: ${inr(EXPECTED_GROSS_PAISE)} (readings ${PREVIOUS_READING}→${CURRENT_READING})`);
  await printJuneInvoices(bill.id);

  const [rishikInv] = await db
    .select()
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.electricityBillId, bill.id),
        eq(electricityInvoices.customerId, RISHIK_CUSTOMER_ID),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    )
    .limit(1);

  if (rishikInv) {
    console.log(`\nRishik current invoice: ${inr(rishikInv.amountPaise)} (${rishikInv.invoiceNumber})`);
    await printOperationsAmount();
  }

  let contributionsLoad = await loadRoomElectricityContributionsForMonth(ROOM_ID, BILLING_MONTH);

  if (syncFinancialOnly || process.argv.includes('--verify')) {
    if (!rishikInv) {
      console.error('STOP: Rishik June invoice not found');
      process.exit(1);
    }
    assertOrStop('Gross room bill', bill.totalPaise, EXPECTED_GROSS_PAISE);
    assertOrStop('Already recovered', contributionsLoad.totalPaise, EXPECTED_RECOVERED_PAISE);
    assertOrStop('Rishik final invoice', rishikInv.amountPaise, EXPECTED_RISHIK_PAISE);

    if (syncFinancialOnly) {
      console.log('\n=== SYNC financial_invoices ===');
      const [staleFin] = await db
        .select({ id: financialInvoices.id, sourceId: financialInvoices.sourceId })
        .from(financialInvoices)
        .where(eq(financialInvoices.invoiceNumber, rishikInv.invoiceNumber))
        .limit(1);

      if (staleFin && staleFin.sourceId !== rishikInv.id) {
        console.log(
          `  Relinking financial_invoices ${staleFin.id} → electricity invoice ${rishikInv.id}`,
        );
        await db
          .update(financialInvoices)
          .set({ sourceId: rishikInv.id, updatedAt: new Date() })
          .where(eq(financialInvoices.id, staleFin.id));
      }

      await db.transaction(async (tx) => {
        await syncElectricityInvoiceToUnifiedInTx(tx, rishikInv.id);
      });
    }

    await verifySurfaces(
      rishikInv.id,
      rishikInv.invoiceNumber,
      rishikInv.amountPaise,
      bill,
      contributionsLoad,
    );
    return;
  }

  if (!execute) {
    console.log('\nAudit complete. Re-run with --execute to repair, --verify to assert, --sync-financial to backfill PDF/WhatsApp row.');
    return;
  }

  console.log('\n=== REPAIR ===');

  for (const c of CONTRIBUTIONS) {
    const exists = existingContributions.some(
      (row) => row.bookingId === c.bookingId && row.amountPaise === c.amountPaise,
    );
    if (exists) {
      console.log(`  Skip ${c.label} — already recorded`);
      continue;
    }
    console.log(`  Insert ${c.label}: ${inr(c.amountPaise)}`);
    await recordHistoricalElectricityContribution({
      roomId: ROOM_ID,
      billingMonth: BILLING_MONTH,
      customerId: c.customerId,
      bookingId: c.bookingId,
      amountPaise: c.amountPaise,
      reason: c.reason,
      contributionDate: BILLING_MONTH,
    });
  }

  contributionsLoad = await loadRoomElectricityContributionsForMonth(ROOM_ID, BILLING_MONTH);
  assertOrStop('Already recovered', contributionsLoad.totalPaise, EXPECTED_RECOVERED_PAISE);

  console.log('\n  Cancelling June invoices for room 204 (July untouched)…');
  await db
    .update(electricityInvoices)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
      cancellationReason: 'Repair: regenerate with room contributions applied',
    })
    .where(
      and(eq(electricityInvoices.electricityBillId, bill.id), ne(electricityInvoices.status, 'cancelled')),
    );

  console.log('  Deleting June bill row…');
  await db.delete(electricityBills).where(eq(electricityBills.id, bill.id));

  console.log('  Regenerating June bill + invoices (841 final reading)…');
  const created = await createElectricityBill({
    roomId: ROOM_ID,
    billingMonth: BILLING_MONTH,
    previousReadingUnits: PREVIOUS_READING,
    currentReadingUnits: CURRENT_READING,
    ratePerUnitPaise: bill.ratePerUnitPaise,
    useProRataByActiveDays: true,
    allowPreviousReadingOverride: true,
    includeFixedStayOccupants: true,
  });

  if (!created.ok) {
    console.error('STOP: createElectricityBill failed', created);
    process.exit(1);
  }

  const [newBill] = await db
    .select({ id: electricityBills.id, totalPaise: electricityBills.totalPaise })
    .from(electricityBills)
    .where(
      and(eq(electricityBills.roomId, ROOM_ID), eq(electricityBills.billingMonth, BILLING_MONTH)),
    )
    .limit(1);

  if (!newBill) {
    console.error('STOP: Bill not recreated');
    process.exit(1);
  }

  assertOrStop('Gross room bill', newBill.totalPaise, EXPECTED_GROSS_PAISE);
  assertOrStop('Remaining balance', newBill.totalPaise - contributionsLoad.totalPaise, EXPECTED_REMAINING_PAISE);

  const [newRishik] = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
    })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.electricityBillId, newBill.id),
        eq(electricityInvoices.customerId, RISHIK_CUSTOMER_ID),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    )
    .limit(1);

  if (!newRishik) {
    console.error('STOP: Rishik invoice missing after regeneration');
    process.exit(1);
  }
  assertOrStop('Rishik final invoice', newRishik.amountPaise, EXPECTED_RISHIK_PAISE);

  console.log('  Syncing financial_invoices row (PDF / WhatsApp)…');
  const [staleFin] = await db
    .select({ id: financialInvoices.id, sourceId: financialInvoices.sourceId })
    .from(financialInvoices)
    .where(eq(financialInvoices.invoiceNumber, newRishik.invoiceNumber))
    .limit(1);
  if (staleFin && staleFin.sourceId !== newRishik.id) {
    await db
      .update(financialInvoices)
      .set({ sourceId: newRishik.id, updatedAt: new Date() })
      .where(eq(financialInvoices.id, staleFin.id));
  }
  await db.transaction(async (tx) => {
    await syncElectricityInvoiceToUnifiedInTx(tx, newRishik.id);
  });

  await verifySurfaces(newRishik.id, newRishik.invoiceNumber, newRishik.amountPaise, newBill, contributionsLoad);
}

async function verifySurfaces(
  rishikInvoiceId: string,
  invoiceNumber: string,
  amountPaise: number,
  bill: { id: string; totalPaise: number },
  contributionsLoad: Awaited<ReturnType<typeof loadRoomElectricityContributionsForMonth>>,
) {
  await printContributions();
  await printJuneInvoices(bill.id);

  const opsRow = await printOperationsAmount();
  if (!opsRow || opsRow.outstandingPaise !== EXPECTED_RISHIK_PAISE) {
    console.error('STOP: Operations queue amount mismatch');
    process.exit(1);
  }

  const residentSummary = await getResidentFinancialSummary(RISHIK_CUSTOMER_ID);
  const elecOutstanding =
    residentSummary?.electricity.items.reduce((s, i) => s + i.outstandingPaise, 0) ?? -1;
  assertOrStop('Resident profile electricity outstanding', elecOutstanding, EXPECTED_RISHIK_PAISE);

  const [finInv] = await db
    .select({
      id: financialInvoices.id,
      shareToken: financialInvoices.shareToken,
      amountPaise: financialInvoices.amountPaise,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, 'electricity_invoices'),
        eq(financialInvoices.sourceId, rishikInvoiceId),
      ),
    )
    .limit(1);

  console.log('\n=== Invoice surfaces ===');
  console.log(`  Admin PDF: /admin/invoices/electricity/${rishikInvoiceId}`);
  console.log(`  API PDF:   /api/invoices/electricity/${rishikInvoiceId}/pdf`);
  if (!finInv?.shareToken) {
    console.error('STOP: financial_invoices share token missing for electricity invoice');
    process.exit(1);
  }
  assertOrStop('Financial invoice amount', finInv.amountPaise, EXPECTED_RISHIK_PAISE);
  console.log(`  WhatsApp/deeplink token: ${finInv.shareToken}`);

  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: ROOM_ID,
    billingMonth: BILLING_MONTH,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  const preview = allocateMonthlyElectricityInvoices({
    grossTotalPaise: bill.totalPaise,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributionsLoad.byCustomerId,
    occupants: occupantLoad.occupants,
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: await countActiveBedsInRoom(ROOM_ID),
  });

  console.log('\n=== FINAL RECONCILIATION ===');
  console.log(`Gross Room Bill     ${inr(bill.totalPaise)}`);
  console.log(`Already Recovered   ${inr(contributionsLoad.totalPaise)}`);
  console.log(`Remaining           ${inr(bill.totalPaise - contributionsLoad.totalPaise)}`);
  console.log(`Resident            Rishik Khobragade`);
  console.log(`Final Invoice       ${inr(amountPaise)}`);
  console.log(`Invoice number      ${invoiceNumber}`);

  const roomTotal =
    contributionsLoad.totalPaise + preview.invoices.reduce((s, i) => s + i.amountPaise, 0);
  if (roomTotal !== bill.totalPaise - preview.remainderPaise) {
    console.error('STOP: Room allocation does not reconcile to gross bill');
    process.exit(1);
  }

  console.log('\n✓ Repair verified — Rishik June electricity is ₹1,272 everywhere.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
