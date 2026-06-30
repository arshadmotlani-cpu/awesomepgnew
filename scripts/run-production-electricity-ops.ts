/* eslint-disable no-console */
/**
 * Production electricity ops — run inside Vercel Functions Shell (has DATABASE_URL).
 *
 *   npx tsx scripts/run-production-electricity-ops.ts
 *   npx tsx scripts/run-production-electricity-ops.ts --admin-email you@example.com
 *
 * Steps: migrate → June 2026 bills (live) → duplicate audit → ₹0 pipeline test invoice → summary
 */
import 'dotenv/config';

import { execSync } from 'node:child_process';
import { and, desc, eq, ilike, isNull } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rooms,
} from '../src/db/schema';
import { getDatabaseConnectionInfo, hasDatabaseUrl } from '../src/lib/db/env';
import { listElectricityInvoicesForBooking } from '../src/db/queries/customer';
import {
  countActiveElectricityInvoiceDuplicates,
  listElectricityInvoiceDuplicateGroups,
} from '../src/services/electricityInvoiceDuplicates';
import { createPipelineTestElectricityInvoice } from '../src/services/electricityPipelineTestInvoice';
import { getElectricitySettlementLedgerView } from '../src/services/electricitySettlementLedgerView';

const BILLING_MONTH = '2026-06-01';
const ROOM_NUMBERS = ['101', '102', '201', '202', '203', '204'] as const;

function paiseToInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function parseAdminEmail(): string {
  const idx = process.argv.indexOf('--admin-email');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  if (process.env.ADMIN_EMAIL?.trim()) return process.env.ADMIN_EMAIL.trim();
  return '';
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

async function printRoomSummaries(pgQuery = 'shanti') {
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
    console.log('\n' + '═'.repeat(72));
    console.log(`ROOM ${num}${row ? ` · ${row.pgName}` : ' — NOT FOUND'}`);
    console.log('═'.repeat(72));

    if (!row) continue;

    const ledger = await getElectricitySettlementLedgerView({
      roomId: row.roomId,
      billingMonth: BILLING_MONTH,
      fallbackTotalBillPaise: grossByRoom[num] ?? 0,
    });

    if (!ledger) {
      console.log('No June 2026 production bill / ledger for this room.');
      continue;
    }

    console.log(`Total bill             : ${paiseToInr(ledger.totalRoomBillPaise)}`);
    console.log(
      `Already collected      : ${paiseToInr(ledger.checkoutSettlementTotalPaise + ledger.manualCreditsTotalPaise + ledger.prepaidCreditAppliedPaise)}`,
    );
    console.log(`  Checkout settlements : ${paiseToInr(ledger.checkoutSettlementTotalPaise)}`);
    for (const c of ledger.checkoutSettlementCredits) {
      console.log(`    · ${c.customerName}: ${paiseToInr(c.amountPaise)} (Already Collected)`);
    }
    console.log(`  Manual credits       : ${paiseToInr(ledger.manualCreditsTotalPaise)}`);
    for (const c of ledger.manualCredits) {
      console.log(`    · ${c.customerName}: ${paiseToInr(c.amountPaise)}`);
    }
    console.log(`Remaining balance      : ${paiseToInr(ledger.remainingRoomBalancePaise)}`);
    console.log(
      `Reconciliation gap     : ${ledger.reconciliationGapPaise} (${ledger.isBalanced ? 'OK' : 'FAIL'})`,
    );

    console.log('Resident invoices:');
    let invoiceCount = 0;
    for (const inv of ledger.residentAllocations) {
      if (inv.excludedBecauseCheckoutPaid) {
        console.log(`  · ${inv.customerName}: excluded (checkout settled)`);
        continue;
      }
      if (inv.amountPaise > 0 || inv.invoiceNumber) {
        invoiceCount += 1;
        console.log(
          `  · ${inv.customerName}: ${paiseToInr(inv.amountPaise)} · ${inv.invoiceNumber ?? '—'} · ${inv.status}`,
        );
      }
    }
    if (invoiceCount === 0) {
      console.log('  (no billable resident invoices — fully covered by credits)');
    }
  }
}

async function verifyResidentProfileVisibility(adminEmail: string) {
  console.log('\n' + '═'.repeat(72));
  console.log('RESIDENT PROFILE — electricity invoice visibility');
  console.log('═'.repeat(72));

  const email = adminEmail.trim().toLowerCase();
  if (!email) {
    console.log('Skipped — pass --admin-email or ADMIN_EMAIL');
    return;
  }

  const [customer] = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (!customer) {
    console.log(`No customer account for ${email}`);
    return;
  }

  const bookingRows = await db
    .select({ id: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(and(eq(bookings.customerId, customer.id), eq(bookings.status, 'confirmed')))
    .orderBy(desc(bookings.createdAt))
    .limit(3);

  if (bookingRows.length === 0) {
    console.log(`${customer.fullName}: no confirmed booking — cannot verify resident electricity list`);
    return;
  }

  for (const bk of bookingRows) {
    const result = await listElectricityInvoicesForBooking(bk.id);
    const rows = result.ok ? result.data : [];
    const june = rows?.filter((r) => r.billingMonth === BILLING_MONTH) ?? [];
    console.log(`\n${customer.fullName} · booking ${bk.bookingCode}:`);
    if (june.length === 0) {
      console.log('  No June 2026 electricity rows visible in resident profile query.');
    }
    for (const inv of june) {
      const tag = inv.amountPaise === 0 ? ' [pipeline test]' : '';
      console.log(
        `  · ${inv.invoiceNumber}: ${paiseToInr(inv.amountPaise)} · ${inv.status}${tag} · room ${inv.roomNumber}`,
      );
    }
  }
}

async function auditDuplicates() {
  const count = await countActiveElectricityInvoiceDuplicates();
  console.log(`\nDuplicate invoice groups: ${count}`);
  if (count > 0) {
    const groups = await listElectricityInvoiceDuplicateGroups();
    for (const g of groups) {
      console.log(`  ${g.pgName} Room ${g.roomNumber} ${g.billingMonth} · ${g.customerName}`);
      for (const inv of g.invoices) {
        console.log(`    ${inv.invoiceNumber} ${inv.status} ${paiseToInr(inv.amountPaise)}`);
      }
    }
    throw new Error(`${count} duplicate invoice group(s) remain — fix before sign-off`);
  }
  console.log('Duplicate check: PASS');
}

async function main() {
  if (!hasDatabaseUrl()) {
    console.error(
      'DATABASE_URL is not set. Run this script from Vercel → Deployments → Functions shell (production).',
    );
    process.exit(1);
  }

  const info = getDatabaseConnectionInfo();
  console.log('Production electricity ops');
  console.log(`Database: ${info.host}/${info.database} (${info.environment})`);

  const adminEmail = parseAdminEmail();
  const pgIdx = process.argv.indexOf('--pg');
  const pgQuery = pgIdx >= 0 ? process.argv[pgIdx + 1] ?? 'shanti' : 'shanti';

  console.log('\n[1/5] Running migrations…');
  execSync('npx tsx src/db/migrate.ts', { stdio: 'inherit', cwd: process.cwd() });

  console.log('\n[2/5] Generating June 2026 electricity bills (LIVE)…');
  execSync('npx tsx scripts/generate-june-2026-electricity-bills.ts', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, DOTENV_CONFIG_PATH: '' },
  });

  console.log('\n[3/5] Duplicate invoice audit…');
  await auditDuplicates();

  console.log('\n[4/5] ₹0 pipeline test invoice…');
  if (!adminEmail) {
    console.warn('WARN: No --admin-email / ADMIN_EMAIL — skipping pipeline test invoice');
  } else {
    const testResult = await createPipelineTestElectricityInvoice({
      adminEmail,
      billingMonth: BILLING_MONTH,
    });
    if (!testResult.ok) {
      throw new Error(`Pipeline test invoice failed: ${testResult.error}`);
    }
    console.log(
      `Pipeline test invoice ${testResult.reused ? 'reused' : 'created'}: ${testResult.invoiceId}`,
    );
    console.log(`  Invoice number: ${testResult.invoiceNumber}`);
    console.log(`  Amount: ${paiseToInr(0)} · status: pending`);
    console.log(`  Financial invoice: ${testResult.financialInvoiceId ?? '(sync pending)'}`);
    console.log(`  Admin UI: /admin/invoices/${testResult.financialInvoiceId ?? testResult.invoiceId}`);
    console.log(`  Resident UI: /account/resident/invoices/${testResult.invoiceId}`);
  }

  console.log('\n[5/5] Per-room summary…');
  await printRoomSummaries(pgQuery);
  await verifyResidentProfileVisibility(adminEmail);

  console.log('\n✓ Production electricity ops complete.');
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\n✗ FAILED:', err instanceof Error ? err.message : err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
