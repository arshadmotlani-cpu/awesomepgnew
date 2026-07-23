/**
 * Final accounting validation before Checkout Settlement V2 resume.
 *
 * Usage:
 *   npx tsx scripts/validate-checkout-rent-accounting.ts --code APG-2026-0045
 */
import { createClient } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { paiseToInr } from '@/src/lib/format';
import { sumAdvanceRentCreditFromSnapshot } from '@/src/lib/billing/checkoutRentProration';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  auditCheckoutRentAccounting,
  discoverCheckoutRentProrationGaps,
} from '@/src/services/checkoutRentAccounting';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, payments, rentInvoices, depositLedger, financialInvoices } from '@/src/db/schema';

loadProductionAuditEnv();
requireDatabaseUrl();

function parseCodeArg(): string {
  const eqArg = process.argv.find((a) => a.startsWith('--code='));
  if (eqArg) return eqArg.split('=')[1]!;
  const idx = process.argv.indexOf('--code');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  return 'APG-2026-0045';
}

type CheckResult = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

async function validateBooking(bookingCode: string): Promise<{
  checks: CheckResult[];
  allPass: boolean;
  snapshot: Record<string, unknown>;
}> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);

  if (!booking) throw new Error(`Booking ${bookingCode} not found`);

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, booking.id))
    .orderBy(payments.paidAt);

  const succeededBookingPayments = paymentRows.filter(
    (p) => p.purpose === 'booking' && p.status === 'succeeded',
  );

  const rentInvoiceRows = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, booking.id))
    .orderBy(rentInvoices.billingMonth);

  const depositRows = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, booking.id))
    .orderBy(depositLedger.createdAt);

  const finInvoiceRows = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.bookingId, booking.id));

  const balances = await getBookingMoneyBalances(booking.id);
  const depositWallet = await getDepositSummaryForBooking(booking.id);
  const accountingAudit = await auditCheckoutRentAccounting(bookingCode);
  const blastRadius = await discoverCheckoutRentProrationGaps();

  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  let advanceCreditTotal = 0;
  for (const p of succeededBookingPayments) {
    advanceCreditTotal += sumAdvanceRentCreditFromSnapshot(snapshot, p.id);
  }

  const paymentTotalPaise = succeededBookingPayments.reduce((a, p) => a + p.amountPaise, 0);
  const rentReceivedPaise = balances?.rent.receivedPaise ?? 0;
  const depositReceivedPaise = balances?.deposit.receivedPaise ?? 0;
  const rentInvoicePaidTotal = rentInvoiceRows
    .filter((r) => r.status !== 'cancelled')
    .reduce((a, r) => a + r.paidPrincipalPaise, 0);
  const depositLedgerCollected = depositRows
    .filter((r) => r.entryKind === 'collected')
    .reduce((a, r) => a + r.amountPaise, 0);
  const depositLedgerNet = depositRows.reduce((a, r) => a + r.amountPaise, 0);

  const allocation =
    succeededBookingPayments[0]
      ? allocateBookingCheckoutPayment(
          {
            subtotalPaise: booking.subtotalPaise,
            discountPaise: booking.discountPaise,
            depositPaise: booking.depositPaise,
            totalPaise: booking.totalPaise,
            pricingSnapshot: snapshot,
          },
          succeededBookingPayments[0].amountPaise,
        )
      : null;

  const paymentClosureExpected =
    rentReceivedPaise + depositReceivedPaise + advanceCreditTotal;
  const paymentClosureDelta = paymentTotalPaise - paymentClosureExpected;

  const checks: CheckResult[] = [];

  // 1. Payment = rent + deposit + credits
  checks.push({
    id: 1,
    name: 'Payment amount = rent received + deposit received + valid credits',
    pass: paymentClosureDelta === 0,
    detail:
      `payment ${paiseToInr(paymentTotalPaise)} = rent ${paiseToInr(rentReceivedPaise)} + deposit ${paiseToInr(depositReceivedPaise)} + credits ${paiseToInr(advanceCreditTotal)}` +
      (paymentClosureDelta !== 0 ? ` (Δ ${paiseToInr(paymentClosureDelta)})` : ''),
  });

  // 2. Outstanding rent zero
  checks.push({
    id: 2,
    name: 'Outstanding rent is zero',
    pass: (balances?.rent.outstandingPaise ?? -1) === 0,
    detail: `required ${paiseToInr(balances?.rent.requiredPaise ?? 0)}, received ${paiseToInr(rentReceivedPaise)}, outstanding ${paiseToInr(balances?.rent.outstandingPaise ?? 0)}`,
  });

  // 3. Deposit ledger = 4121
  checks.push({
    id: 3,
    name: 'Deposit ledger net equals ₹4,121',
    pass: depositLedgerNet === 412_080 && depositWallet?.collectedPaise === 412_080,
    detail: `ledger net ${paiseToInr(depositLedgerNet)}, wallet collected ${paiseToInr(depositWallet?.collectedPaise ?? 0)}, refundable ${paiseToInr(depositWallet?.refundableBalancePaise ?? 0)}`,
  });

  // 4. Invoice history not duplicated (one non-adhoc per billing month)
  const nonAdhoc = rentInvoiceRows.filter((r) => !r.isAdhoc);
  const monthCounts = new Map<string, number>();
  for (const inv of nonAdhoc) {
    monthCounts.set(inv.billingMonth, (monthCounts.get(inv.billingMonth) ?? 0) + 1);
  }
  const duplicateMonths = [...monthCounts.entries()].filter(([, c]) => c > 1);
  checks.push({
    id: 4,
    name: 'Invoice history has not been duplicated',
    pass: duplicateMonths.length === 0,
    detail:
      duplicateMonths.length === 0
        ? `${nonAdhoc.length} non-adhoc invoice(s): ${nonAdhoc.map((i) => i.invoiceNumber).join(', ')}`
        : `Duplicate billing months: ${duplicateMonths.map(([m, c]) => `${m}×${c}`).join(', ')}`,
  });

  // 5. Repair did not create duplicate invoices
  const repairAudit = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM audit_log
    WHERE entity = 'rent_invoice'
      AND action = 'checkout_rent_accounting_repair'
      AND (diff->>'bookingCode') = ${bookingCode}
  `);
  const repairCount = (repairAudit[0] as { count: number } | undefined)?.count ?? 0;
  const paidLinkedToCheckout = nonAdhoc.filter(
    (r) =>
      r.status === 'paid' &&
      succeededBookingPayments.some((p) => p.id === r.paymentId),
  );
  checks.push({
    id: 5,
    name: 'Repair did not create duplicate invoices',
    pass: paidLinkedToCheckout.length === 1 && nonAdhoc.length === 1,
    detail: `repair audit entries ${repairCount}, paid checkout-linked invoices ${paidLinkedToCheckout.length}, total non-adhoc ${nonAdhoc.length}`,
  });

  // 6. Payment, invoice, ledger totals reconcile
  const invoiceRentFaceTotal = nonAdhoc
    .filter((r) => r.status !== 'cancelled')
    .reduce((a, r) => a + r.rentPaise, 0);
  const ledgerMatchesDeposit = depositLedgerCollected === depositReceivedPaise;
  const invoiceMatchesRent = rentInvoicePaidTotal === rentReceivedPaise;
  const allocationMatches =
    allocation != null &&
    allocation.rentPaise === rentReceivedPaise &&
    allocation.depositCashPaise === depositReceivedPaise;
  checks.push({
    id: 6,
    name: 'Payment, invoice, and ledger totals reconcile',
    pass:
      paymentClosureDelta === 0 &&
      invoiceMatchesRent &&
      ledgerMatchesDeposit &&
      allocationMatches === true,
    detail:
      `payment ${paiseToInr(paymentTotalPaise)} | allocation rent ${paiseToInr(allocation?.rentPaise ?? 0)} deposit ${paiseToInr(allocation?.depositCashPaise ?? 0)} | invoice paid ${paiseToInr(rentInvoicePaidTotal)} face ${paiseToInr(invoiceRentFaceTotal)} | deposit ledger collected ${paiseToInr(depositLedgerCollected)}`,
  });

  // 7. Blast radius zero
  checks.push({
    id: 7,
    name: 'Zero checkout rent proration gaps (blast radius)',
    pass: blastRadius.length === 0 && accountingAudit?.closed === true,
    detail: `global gaps ${blastRadius.length}, booking closed ${accountingAudit?.closed ?? false}`,
  });

  const allPass = checks.every((c) => c.pass);

  return {
    checks,
    allPass,
    snapshot: {
      bookingCode,
      bookingId: booking.id,
      paymentTotalPaise,
      rentReceivedPaise,
      depositReceivedPaise,
      advanceCreditTotal,
      rentInvoices: nonAdhoc.map((r) => ({
        invoiceNumber: r.invoiceNumber,
        billingMonth: r.billingMonth,
        rentPaise: r.rentPaise,
        paidPrincipalPaise: r.paidPrincipalPaise,
        status: r.status,
        paymentId: r.paymentId,
        notes: r.notes,
      })),
      depositLedger: depositRows.map((r) => ({
        entryKind: r.entryKind,
        amountPaise: r.amountPaise,
        relatedPaymentId: r.relatedPaymentId,
      })),
      financialInvoices: finInvoiceRows.map((f) => ({
        invoiceNumber: f.invoiceNumber,
        amountPaise: f.amountPaise,
        sourceTable: f.sourceTable,
        sourceId: f.sourceId,
      })),
      balances,
      accountingAudit,
    },
  };
}

async function main() {
  const bookingCode = parseCodeArg();
  const { close } = createClient();

  try {
    const result = await validateBooking(bookingCode);

    console.log('═'.repeat(80));
    console.log('CHECKOUT RENT ACCOUNTING — FINAL VALIDATION');
    console.log('═'.repeat(80));
    console.log(`Booking: ${bookingCode}`);
    console.log(`Verified at: ${new Date().toISOString()}`);
    console.log('');

    for (const check of result.checks) {
      console.log(`[${check.pass ? 'PASS' : 'FAIL'}] ${check.id}. ${check.name}`);
      console.log(`       ${check.detail}`);
    }

    console.log('');
    console.log('─'.repeat(80));
    console.log(
      result.allPass
        ? 'ACCOUNTING LAYER: VERIFIED — safe to resume Checkout Settlement V2 validation'
        : 'ACCOUNTING LAYER: NOT VERIFIED — do not resume settlement validation',
    );
    console.log('═'.repeat(80));

    console.log('\n--- DETAIL SNAPSHOT ---');
    console.log(JSON.stringify(result.snapshot, null, 2));

    process.exit(result.allPass ? 0 : 1);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
