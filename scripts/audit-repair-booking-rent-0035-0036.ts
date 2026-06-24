#!/usr/bin/env npx tsx
/**
 * Audit + idempotent repair for APG-2026-0035 and APG-2026-0036 booking rent invoices.
 *
 *   npx tsx scripts/audit-repair-booking-rent-0035-0036.ts           # audit only
 *   npx tsx scripts/audit-repair-booking-rent-0035-0036.ts --execute # repair + re-audit
 *
 * Vercel build: REPAIR_BOOKING_RENT_0035_0036=1
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { createClient, type Database } from '../src/db/client';
import {
  bookings,
  depositLedger,
  financialInvoices,
  payments,
  rentInvoices,
} from '../src/db/schema';
import { getBusinessMetricsSummary } from '../src/db/queries/admin';
import { batchLookupFinancialInvoiceIds } from '../src/lib/billing/invoiceNumbering.server';
import { allocateBookingCheckoutPayment } from '../src/lib/billing/bookingPaymentAllocation';
import { paiseToInr } from '../src/lib/format';
import { firstOfMonth } from '../src/services/billing';
import {
  computeBookingRentPaisePaid,
  ensureBookingRentInvoiceForExistingPayment,
} from '../src/services/bookingPaymentInvoices';
import { getInvoiceCommandCenterData } from '../src/services/invoiceCommandCenter';
import { loadResidentAccountContext } from '../src/services/residentAccountContext';
import { syncRentInvoiceToUnified } from '../src/services/unifiedInvoices';

const TARGET_CODES = ['APG-2026-0035', 'APG-2026-0036'] as const;

for (const file of [
  '.env.production.local',
  '.env.prod',
  '.env.local',
  '.env',
  '.env.repair.local',
  '.env.vercel.prod.live',
]) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) config({ path, override: false });
}
if (existsSync(join(process.cwd(), '.env.vercel.pull.tmp'))) {
  config({ path: join(process.cwd(), '.env.vercel.pull.tmp'), override: true });
}

type AuditRow = {
  bookingCode: string;
  bookingId: string;
  status: string;
  bedCode: string | null;
  depositHeldPaise: number;
  payment: {
    id: string;
    amountPaise: number;
    status: string;
    paidAt: string | null;
  } | null;
  allocation: ReturnType<typeof allocateBookingCheckoutPayment> | null;
  rentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    rentPaise: number;
    paidPrincipalPaise: number;
    paymentId: string | null;
    billingMonth: string;
  }>;
  financialInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    sourceTable: string | null;
    sourceId: string | null;
    amountPaise: number;
  }>;
  rentInvoiceLinkedToPayment: boolean;
  financialInvoiceLinked: boolean;
  incomeRentPaiseForBillingMonth: number;
  billingMonth: string;
  residentRentHistoryPaise: number;
  commandCenterRentPaise: number | null;
  commandCenterDate: string | null;
  checks: Record<string, boolean>;
};

async function depositHeldPaise(db: Database, bookingId: string): Promise<number> {
  const rows = await db
    .select({ amountPaise: depositLedger.amountPaise, entryKind: depositLedger.entryKind })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId));
  let held = 0;
  for (const r of rows) {
    if (r.entryKind === 'collected') held += r.amountPaise;
    if (r.entryKind === 'refunded' || r.entryKind === 'deducted') held -= Math.abs(r.amountPaise);
  }
  return Math.max(0, held);
}

async function auditBooking(db: Database, bookingCode: string): Promise<AuditRow | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return null;

  const [bedRow] = await db.execute<{ bed_code: string }>(sql`
    SELECT b.bed_code
    FROM bed_reservations br
    INNER JOIN beds b ON b.id = br.bed_id
    WHERE br.booking_id = ${booking.id} AND br.kind = 'primary'
    LIMIT 1
  `);

  const pays = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), eq(payments.purpose, 'booking')))
    .orderBy(payments.paidAt);

  const succeeded = pays.find((p) => p.status === 'succeeded' && p.amountPaise > 0) ?? null;

  const allocation = succeeded
    ? allocateBookingCheckoutPayment(booking, succeeded.amountPaise)
    : null;

  const rentInvs = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paymentId: rentInvoices.paymentId,
      billingMonth: rentInvoices.billingMonth,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, booking.id));

  const finInvs = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      status: financialInvoices.status,
      sourceTable: financialInvoices.sourceTable,
      sourceId: financialInvoices.sourceId,
      amountPaise: financialInvoices.amountPaise,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.bookingId, booking.id));

  const finByRent = await batchLookupFinancialInvoiceIds(
    rentInvs.map((r) => ({ sourceTable: 'rent_invoices' as const, sourceId: r.id })),
  );

  const paymentDate = succeeded?.paidAt
    ? succeeded.paidAt.toISOString().slice(0, 10)
    : booking.createdAt.toISOString().slice(0, 10);
  const billingMonth = firstOfMonth(paymentDate);

  const metrics = await getBusinessMetricsSummary(billingMonth);
  const incomeRentPaise =
    metrics.ok && succeeded
      ? rentInvs
          .filter(
            (r) =>
              r.status === 'paid' &&
              r.billingMonth === billingMonth &&
              (r.paymentId === succeeded.id || r.paidPrincipalPaise > 0),
          )
          .reduce((a, r) => a + r.paidPrincipalPaise, 0)
      : 0;

  const globalIncomeRent = metrics.ok ? metrics.data.incomeRentPaise : 0;

  const accountCtx = await loadResidentAccountContext(booking.customerId);
  const residentRentHistoryPaise =
    accountCtx.rentPaymentHistory
      .filter((h) => rentInvs.some((r) => r.id === h.id))
      .reduce((a, h) => a + h.paidPaise, 0) ||
    accountCtx.rentPaymentHistory.reduce((a, h) => a + h.paidPaise, 0);

  let commandCenterRentPaise: number | null = null;
  try {
    const cc = await getInvoiceCommandCenterData(paymentDate);
    commandCenterRentPaise = cc.summary.rentCollectedPaise;
  } catch {
    commandCenterRentPaise = null;
  }

  const linkedRent = succeeded
    ? rentInvs.some((r) => r.status === 'paid' && r.paymentId === succeeded.id)
    : false;
  const linkedFin = rentInvs.some((r) => finByRent[r.id] != null);

  const expectedRent = succeeded
    ? computeBookingRentPaisePaid({ booking, paymentAmountPaise: succeeded.amountPaise })
    : 0;

  const checks = {
    q1_rentInvoiceExists: rentInvs.some((r) => r.status === 'paid' && r.paidPrincipalPaise > 0),
    q2_financialInvoiceExists: linkedFin || finInvs.length > 0,
    q3_revenueEntryExists:
      globalIncomeRent > 0 ||
      (linkedRent && rentInvs.some((r) => r.paidPrincipalPaise >= expectedRent && expectedRent > 0)),
    q4_residentHistoryShowsRent: residentRentHistoryPaise >= expectedRent && expectedRent > 0,
    q5_adminInvoiceCenterShows:
      (commandCenterRentPaise ?? 0) >= expectedRent && expectedRent > 0,
    q6_incomeRentPaiseIncludesBooking:
      incomeRentPaise >= expectedRent && expectedRent > 0,
  };

  return {
    bookingCode,
    bookingId: booking.id,
    status: booking.status,
    bedCode: bedRow[0]?.bed_code ?? null,
    depositHeldPaise: await depositHeldPaise(db, booking.id),
    payment: succeeded
      ? {
          id: succeeded.id,
          amountPaise: succeeded.amountPaise,
          status: succeeded.status,
          paidAt: succeeded.paidAt?.toISOString() ?? null,
        }
      : null,
    allocation,
    rentInvoices: rentInvs,
    financialInvoices: finInvs,
    rentInvoiceLinkedToPayment: linkedRent,
    financialInvoiceLinked: linkedFin,
    incomeRentPaiseForBillingMonth: incomeRentPaise,
    billingMonth,
    residentRentHistoryPaise,
    commandCenterRentPaise,
    commandCenterDate: paymentDate,
    checks,
  };
}

async function repairBooking(db: Database, bookingCode: string): Promise<Record<string, unknown>> {
  const [booking] = await db
    .select({ id: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return { bookingCode, error: 'not found' };

  const pays = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, booking.id),
        eq(payments.purpose, 'booking'),
        eq(payments.status, 'succeeded'),
      ),
    );

  const actions: unknown[] = [];
  for (const p of pays) {
    const beforeRent = await db
      .select({ id: rentInvoices.id })
      .from(rentInvoices)
      .where(and(eq(rentInvoices.bookingId, booking.id), eq(rentInvoices.paymentId, p.id)));
    const result = await ensureBookingRentInvoiceForExistingPayment(p.id);
    actions.push({ paymentId: p.id, beforeRentCount: beforeRent.length, result });

    if ('invoiceId' in result && result.invoiceId) {
      await syncRentInvoiceToUnified(result.invoiceId);
    }
  }

  return { bookingCode, actions };
}

async function revenueSnapshot(billingMonth: string) {
  const summary = await getBusinessMetricsSummary(billingMonth);
  if (!summary.ok) return { error: summary.error };
  return {
    billingMonth,
    incomeRentPaise: summary.data.incomeRentPaise,
    incomeTotalPaise: summary.data.incomeTotalPaise,
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const { db, close } = createClient();

  try {
    console.log('═'.repeat(72));
    console.log(`BOOKING RENT INVOICE AUDIT — ${TARGET_CODES.join(', ')}`);
    console.log(`Mode: ${execute ? 'EXECUTE (repair + re-audit)' : 'AUDIT ONLY'}`);
    console.log('═'.repeat(72));

    const billingMonths = new Set<string>();
    const beforeAudits: AuditRow[] = [];
    for (const code of TARGET_CODES) {
      const row = await auditBooking(db, code);
      if (!row) {
        console.error(`\n${code}: NOT FOUND`);
        continue;
      }
      beforeAudits.push(row);
      billingMonths.add(row.billingMonth);
    }

    const revenueBefore: Record<string, unknown> = {};
    for (const m of billingMonths) {
      revenueBefore[m] = await revenueSnapshot(m);
    }

    console.log('\n--- REVENUE BEFORE ---');
    console.log(JSON.stringify(revenueBefore, null, 2));

    console.log('\n--- AUDIT BEFORE ---');
    for (const row of beforeAudits) {
      console.log(JSON.stringify(row, null, 2));
    }

    const repairResults: unknown[] = [];
    if (execute) {
      console.log('\n--- REPAIR ---');
      for (const code of TARGET_CODES) {
        const needsRepair = beforeAudits.find((a) => a.bookingCode === code);
        if (
          needsRepair?.payment &&
          needsRepair.depositHeldPaise > 0 &&
          !needsRepair.rentInvoiceLinkedToPayment
        ) {
          repairResults.push(await repairBooking(db, code));
        } else if (needsRepair && !needsRepair.financialInvoiceLinked) {
          for (const ri of needsRepair.rentInvoices) {
            await syncRentInvoiceToUnified(ri.id);
          }
          repairResults.push({ bookingCode: code, action: 'synced financial invoices only' });
        } else {
          repairResults.push({ bookingCode: code, action: 'skipped — already linked or no payment' });
        }
      }
      console.log(JSON.stringify(repairResults, null, 2));
    }

    const afterAudits: AuditRow[] = [];
    for (const code of TARGET_CODES) {
      const row = await auditBooking(db, code);
      if (row) afterAudits.push(row);
    }

    const revenueAfter: Record<string, unknown> = {};
    for (const m of billingMonths) {
      revenueAfter[m] = await revenueSnapshot(m);
    }

    console.log('\n--- REVENUE AFTER ---');
    console.log(JSON.stringify(revenueAfter, null, 2));

    console.log('\n--- PASS / FAIL MATRIX ---');
    const matrix: Array<Record<string, unknown>> = [];
    for (const row of afterAudits) {
      const expectedRent = row.allocation?.rentPaise ?? 0;
      const paidRent = row.rentInvoices.find(
        (r) => r.status === 'paid' && r.paymentId === row.payment?.id,
      );
      const finId = paidRent
        ? (await batchLookupFinancialInvoiceIds([
            { sourceTable: 'rent_invoices', sourceId: paidRent.id },
          ]))[paidRent.id]
        : null;

      matrix.push({
        bookingCode: row.bookingCode,
        rentInvoiceId: paidRent?.id ?? null,
        financialInvoiceId: finId ?? null,
        revenueImpactPaise: paidRent?.paidPrincipalPaise ?? 0,
        expectedRentPaise: expectedRent,
        depositHeldPaise: row.depositHeldPaise,
        ...row.checks,
        overallPass: Object.values(row.checks).every(Boolean),
      });

      console.log(
        `${row.bookingCode}: ${Object.values(row.checks).every(Boolean) ? 'PASS' : 'FAIL'}`,
      );
      console.log(`  Rent invoice:     ${paidRent?.id ?? 'MISSING'}`);
      console.log(`  Financial invoice: ${finId ?? 'MISSING'}`);
      console.log(`  Revenue impact:   ${paiseToInr(paidRent?.paidPrincipalPaise ?? 0)}`);
      for (const [k, v] of Object.entries(row.checks)) {
        console.log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);
      }
    }

    console.log('\n--- SUMMARY JSON ---');
    console.log(
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          execute,
          revenueBefore,
          revenueAfter,
          repairResults,
          matrix,
          overallPass: matrix.every((m) => m.overallPass),
        },
        null,
        2,
      ),
    );

    if (execute && !matrix.every((m) => m.overallPass)) {
      process.exit(1);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
