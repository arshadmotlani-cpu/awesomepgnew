/**
 * Production June 2026 electricity ops — same steps as scripts/run-production-electricity-ops.ts
 */
import { and, desc, eq, ilike, isNull } from 'drizzle-orm';
import { runPendingMigrations } from '@/src/db/runPendingMigrations';
import { db } from '@/src/db/client';
import { bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import { listElectricityInvoicesForBooking } from '@/src/db/queries/customer';
import { getDatabaseConnectionInfo, hasDatabaseUrl } from '@/src/lib/db/env';
import {
  countActiveElectricityInvoiceDuplicates,
  listElectricityInvoiceDuplicateGroups,
} from '@/src/services/electricityInvoiceDuplicates';
import { createPipelineTestElectricityInvoice } from '@/src/services/electricityPipelineTestInvoice';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { runGenerateJune2026ElectricityBills } from '@/src/services/generateJune2026ElectricityBills';

const BILLING_MONTH = '2026-06-01';
const ROOM_NUMBERS = ['101', '102', '201', '202', '203', '204'] as const;

export type ProductionOpsLogFn = (line: string) => void;

function paiseToInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function resolveRooms(pgQuery = 'shanti') {
  return db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(ilike(pgs.name, `%${pgQuery}%`), isNull(pgs.archivedAt), isNull(rooms.archivedAt)),
    )
    .then((rows) =>
      rows.filter((r) => (ROOM_NUMBERS as readonly string[]).includes(r.roomNumber)),
    );
}

async function printRoomSummaries(onLog: ProductionOpsLogFn, pgQuery = 'shanti') {
  const roomRows = await resolveRooms(pgQuery);
  const grossByRoom: Record<string, number> = {
    '101': 38 * 1600,
    '102': 36 * 1600,
    '201': 102 * 1600,
    '202': 155 * 1600,
    '203': 287 * 1600,
    '204': 188 * 1600,
  };

  for (const num of ROOM_NUMBERS) {
    const row = roomRows.find((r) => r.roomNumber === num);
    onLog('\n' + '═'.repeat(72));
    onLog(`ROOM ${num}${row ? ` · ${row.pgName}` : ' — NOT FOUND'}`);
    onLog('═'.repeat(72));

    if (!row) continue;

    const ledger = await getElectricitySettlementLedgerView({
      roomId: row.roomId,
      billingMonth: BILLING_MONTH,
      fallbackTotalBillPaise: grossByRoom[num] ?? 0,
    });

    if (!ledger) {
      onLog('No June 2026 production bill / ledger for this room.');
      continue;
    }

    onLog(`Total bill             : ${paiseToInr(ledger.totalRoomBillPaise)}`);
    onLog(
      `Already collected      : ${paiseToInr(ledger.checkoutSettlementTotalPaise + ledger.manualCreditsTotalPaise + ledger.prepaidCreditAppliedPaise)}`,
    );
    onLog(`  Checkout settlements : ${paiseToInr(ledger.checkoutSettlementTotalPaise)}`);
    for (const c of ledger.checkoutSettlementCredits) {
      onLog(`    · ${c.customerName}: ${paiseToInr(c.amountPaise)} (Already Collected)`);
    }
    onLog(`  Manual credits       : ${paiseToInr(ledger.manualCreditsTotalPaise)}`);
    for (const c of ledger.manualCredits) {
      onLog(`    · ${c.customerName}: ${paiseToInr(c.amountPaise)}`);
    }
    onLog(`Remaining balance      : ${paiseToInr(ledger.remainingRoomBalancePaise)}`);
    onLog(
      `Reconciliation gap     : ${ledger.reconciliationGapPaise} (${ledger.isBalanced ? 'OK' : 'FAIL'})`,
    );

    onLog('Resident invoices:');
    let invoiceCount = 0;
    for (const inv of ledger.residentAllocations) {
      if (inv.excludedBecauseCheckoutPaid) {
        onLog(`  · ${inv.customerName}: excluded (checkout settled)`);
        continue;
      }
      if (inv.amountPaise > 0 || inv.invoiceNumber) {
        invoiceCount += 1;
        onLog(
          `  · ${inv.customerName}: ${paiseToInr(inv.amountPaise)} · ${inv.invoiceNumber ?? '—'} · ${inv.status}`,
        );
      }
    }
    if (invoiceCount === 0) {
      onLog('  (no billable resident invoices — fully covered by credits)');
    }
  }
}

async function verifyResidentProfileVisibility(adminEmail: string, onLog: ProductionOpsLogFn) {
  onLog('\n' + '═'.repeat(72));
  onLog('RESIDENT PROFILE — electricity invoice visibility');
  onLog('═'.repeat(72));

  const email = adminEmail.trim().toLowerCase();
  if (!email) {
    onLog('Skipped — no admin email on session');
    return;
  }

  const [customer] = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (!customer) {
    onLog(`No customer account for ${email}`);
    return;
  }

  const bookingRows = await db
    .select({ id: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(and(eq(bookings.customerId, customer.id), eq(bookings.status, 'confirmed')))
    .orderBy(desc(bookings.createdAt))
    .limit(3);

  if (bookingRows.length === 0) {
    onLog(`${customer.fullName}: no confirmed booking — cannot verify resident electricity list`);
    return;
  }

  for (const bk of bookingRows) {
    const result = await listElectricityInvoicesForBooking(bk.id);
    const rows = result.ok ? result.data : [];
    const june = rows?.filter((r) => r.billingMonth === BILLING_MONTH) ?? [];
    onLog(`\n${customer.fullName} · booking ${bk.bookingCode}:`);
    if (june.length === 0) {
      onLog('  No June 2026 electricity rows visible in resident profile query.');
    }
    for (const inv of june) {
      const tag = inv.amountPaise === 0 ? ' [pipeline test]' : '';
      onLog(
        `  · ${inv.invoiceNumber}: ${paiseToInr(inv.amountPaise)} · ${inv.status}${tag} · room ${inv.roomNumber}`,
      );
    }
  }
}

async function auditDuplicates(onLog: ProductionOpsLogFn) {
  const count = await countActiveElectricityInvoiceDuplicates();
  onLog(`\nDuplicate invoice groups: ${count}`);
  if (count > 0) {
    const groups = await listElectricityInvoiceDuplicateGroups();
    for (const g of groups) {
      onLog(`  ${g.pgName} Room ${g.roomNumber} ${g.billingMonth} · ${g.customerName}`);
      for (const inv of g.invoices) {
        onLog(`    ${inv.invoiceNumber} ${inv.status} ${paiseToInr(inv.amountPaise)}`);
      }
    }
    throw new Error(`${count} duplicate invoice group(s) remain — fix before sign-off`);
  }
  onLog('Duplicate check: PASS');
}

export async function runJuneElectricityProductionOps(input: {
  adminEmail: string;
  adminId: string;
  pgQuery?: string;
  onLog: ProductionOpsLogFn;
}): Promise<void> {
  const { onLog, adminEmail, pgQuery = 'shanti' } = input;

  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is not configured on this runtime.');
  }

  const info = getDatabaseConnectionInfo();
  onLog('Production electricity ops');
  onLog(`Database: ${info.host}/${info.database} (${info.environment})`);

  onLog('\n[1/5] Running migrations…');
  await runPendingMigrations(onLog);

  onLog('\n[2/5] Generating June 2026 electricity bills (LIVE)…');
  await runGenerateJune2026ElectricityBills({ onLog, pgQuery, dryRun: false });

  onLog('\n[3/5] Duplicate invoice audit…');
  await auditDuplicates(onLog);

  onLog('\n[4/5] ₹0 pipeline test invoice…');
  if (!adminEmail.trim()) {
    onLog('WARN: No admin email — skipping pipeline test invoice');
  } else {
    const testResult = await createPipelineTestElectricityInvoice({
      adminEmail,
      billingMonth: BILLING_MONTH,
    });
    if (!testResult.ok) {
      throw new Error(`Pipeline test invoice failed: ${testResult.error}`);
    }
    onLog(
      `Pipeline test invoice ${testResult.reused ? 'reused' : 'created'}: ${testResult.invoiceId}`,
    );
    onLog(`  Invoice number: ${testResult.invoiceNumber}`);
    onLog(`  Amount: ${paiseToInr(0)} · status: pending`);
    onLog(`  Financial invoice: ${testResult.financialInvoiceId ?? '(sync pending)'}`);
    onLog(`  Admin UI: /admin/invoices/${testResult.financialInvoiceId ?? testResult.invoiceId}`);
    onLog(`  Resident UI: /account/resident/invoices/${testResult.invoiceId}`);
  }

  onLog('\n[5/5] Per-room summary…');
  await printRoomSummaries(onLog, pgQuery);
  await verifyResidentProfileVisibility(adminEmail, onLog);

  onLog('\n✓ Production electricity ops complete.');
}
