/**
 * Regression verification for APG-2026-0082-style corrupt proof rows.
 *
 * Usage:
 *   npx tsx scripts/verify-booking-payment-review-regression.ts
 *   npx tsx scripts/verify-booking-payment-review-regression.ts --booking-code APG-2026-0082
 *   npx tsx scripts/verify-booking-payment-review-regression.ts --discover-corrupt
 */
import 'dotenv/config';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  bedReservations,
  bookings,
  depositLedger,
  payments,
  pgPaymentRecords,
  rentInvoices,
} from '../src/db/schema';
import { breakdownBookingCheckoutPayment } from '../src/lib/billing/bookingCheckoutTotals';
import {
  buildBookingPaymentVerificationAudit,
  expectedContractPaiseFromBooking,
  screenshotAmountPaiseFromProofRecord,
} from '../src/lib/billing/bookingPaymentVerificationAudit';
import {
  buildPaymentReviewVerification,
  expectedPaymentPaiseFromBooking,
  screenshotAmountPaiseFromProof,
} from '../src/lib/operations/paymentReviewVerification';
import type { PendingPaymentReviewItem } from '../src/lib/operations/paymentReviewTypes';
import { loadBookingPaymentVerificationAudit } from '../src/services/bookingPaymentVerificationAudit';
import { parseDaterange } from '../src/services/availability';
import { formatDate } from '../src/lib/dates';

const DEFAULT_CODES = ['APG-2026-0082'];

function readFlags(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) {
      out.push(process.argv[i + 1]!);
    }
  }
  return out;
}

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

type Check = { id: string; pass: boolean; detail: string };

function check(id: string, pass: boolean, detail: string): Check {
  return { id, pass, detail };
}

function bookingDetailsFromRow(b: {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  pricingSnapshot: unknown;
  billingAnchorDate: string | null;
  status: string;
  durationMode: string;
  stayType: string;
}) {
  const breakdown = breakdownBookingCheckoutPayment({
    subtotalPaise: b.subtotalPaise,
    discountPaise: b.discountPaise,
    depositPaise: b.depositPaise,
    pricingSnapshot: b.pricingSnapshot as never,
  });
  return {
    moveInDate: b.billingAnchorDate,
    moveOutDate: null,
    durationLabel: b.durationMode,
    roomType: null,
    bedCode: null,
    roomNumber: null,
    monthlyRentPaise: breakdown.rentDuePaise,
    depositRequiredPaise: breakdown.depositCashDuePaise,
    durationMode: b.durationMode,
    stayType: b.stayType,
    bookingStatus: b.status,
    subtotalPaise: b.subtotalPaise,
    discountPaise: b.discountPaise,
    rentDuePaise: breakdown.rentDuePaise,
  };
}

function reviewItemFromProof(
  bookingRow: Awaited<ReturnType<typeof loadBookingBundle>>['booking'],
  proof: Awaited<ReturnType<typeof loadBookingBundle>>['proofs'][number],
): PendingPaymentReviewItem {
  const details = bookingDetailsFromRow(bookingRow);
  const expected = details.monthlyRentPaise + details.depositRequiredPaise;
  return {
    key: `qr-${proof.id}`,
    kind: 'qr',
    pgId: proof.pgId,
    pgName: 'PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: bookingRow.bookingCode,
    roomNumber: null,
    bedCode: null,
    paymentTypeLabel: 'Monthly Stay',
    title: 'Review',
    subtitle: '',
    amountPaise: proof.amountPaise,
    screenshotUrl: proof.paymentScreenshotUrl ?? '',
    entityId: proof.id,
    customerId: bookingRow.customerId,
    bookingId: bookingRow.id,
    expectedLines: [],
    expectedTotalPaise: expected,
    receivedPaise: proof.amountPaise,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    bookingDetails: details,
    submittedAmountPaise: proof.proofSnapshotSubmittedPaise,
  };
}

async function loadBookingBundle(bookingCode: string) {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return null;

  const proofs = await db
    .select()
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.bookingId, booking.id))
    .orderBy(desc(pgPaymentRecords.updatedAt));

  const bookingPayments = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), eq(payments.purpose, 'booking')))
    .orderBy(desc(payments.createdAt));

  const invoices = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, booking.id))
    .orderBy(desc(rentInvoices.createdAt));

  const ledger = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, booking.id))
    .orderBy(desc(depositLedger.createdAt));

  const [primaryRes] = await db
    .select({ stayRange: bedReservations.stayRange })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, booking.id), eq(bedReservations.kind, 'primary')))
    .limit(1);

  return { booking, proofs, bookingPayments, invoices, ledger, primaryRes };
}

async function discoverCorruptBookingCodes(): Promise<string[]> {
  const rows = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bookings)
    .innerJoin(pgPaymentRecords, eq(pgPaymentRecords.bookingId, bookings.id))
    .where(
      or(
        eq(pgPaymentRecords.amountPaise, 1_236_200),
        eq(pgPaymentRecords.proofSnapshotSubmittedPaise, 1_236_200),
      ),
    )
    .groupBy(bookings.bookingCode);

  return rows.map((r) => r.bookingCode);
}

async function verifyBooking(bookingCode: string): Promise<{ bookingCode: string; checks: Check[] }> {
  const bundle = await loadBookingBundle(bookingCode);
  const checks: Check[] = [];
  if (!bundle) {
    return {
      bookingCode,
      checks: [check('exists', false, 'Booking not found in database.')],
    };
  }

  const { booking, proofs, bookingPayments, invoices, ledger, primaryRes } = bundle;
  const breakdown = breakdownBookingCheckoutPayment(booking);
  const expectedContract =
    breakdown.rentDuePaise + breakdown.depositCashDuePaise;

  const activeProof =
    proofs.find((p) => p.status === 'approved') ??
    proofs.find((p) => p.status === 'pending') ??
    proofs[0] ??
    null;

  if (activeProof) {
    const item = reviewItemFromProof(booking, activeProof);
    const review = buildPaymentReviewVerification(item);
    checks.push(
      check(
        'review.expected',
        review.expectedPaymentPaise === expectedContract,
        `Expected ${inr(review.expectedPaymentPaise)} (want ${inr(expectedContract)} from rent+deposit)`,
      ),
      check(
        'review.expected-not-proof',
        review.expectedPaymentPaise !== 1_236_200,
        `Expected must not equal corrupt proof total ${inr(1_236_200)}`,
      ),
    );

    if (activeProof.proofSnapshotSubmittedPaise === 618_000 || activeProof.amountPaise === 618_000) {
      checks.push(
        check(
          'review.screenshot',
          review.screenshotAmountPaise === 618_000,
          `Screenshot ${inr(review.screenshotAmountPaise)} (want ${inr(618_000)})`,
        ),
      );
    } else if (activeProof.proofSnapshotSubmittedPaise === 1_236_200 && activeProof.amountPaise !== 618_000) {
      checks.push(
        check(
          'review.screenshot-not-corrupt',
          review.screenshotAmountPaise !== 1_236_200,
          `Screenshot must not remain corrupt ${inr(1_236_200)}; got ${inr(review.screenshotAmountPaise)}`,
        ),
      );
    }

    checks.push(
      check(
        'review.difference',
        review.differencePaise === expectedContract - review.screenshotAmountPaise,
        `Difference ${inr(review.differencePaise)} = Expected − Screenshot`,
      ),
    );
  } else {
    checks.push(check('review.proof', false, 'No pg_payment_records row for booking.'));
  }

  if (booking.status === 'confirmed' || booking.status === 'active') {
    const succeeded = bookingPayments.find((p) => p.status === 'succeeded');
    if (succeeded) {
      const payload = succeeded.rawPayload as { screenshotAmountPaise?: number } | null;
      checks.push(
        check(
          'approve.payment-contract',
          succeeded.amountPaise === expectedContract,
          `payments.amount_paise ${inr(succeeded.amountPaise)} (want contract ${inr(expectedContract)}, not screenshot)`,
        ),
      );
      if (payload?.screenshotAmountPaise != null) {
        checks.push(
          check(
            'approve.screenshot-audit',
            payload.screenshotAmountPaise !== succeeded.amountPaise || payload.screenshotAmountPaise === 618_000,
            `rawPayload.screenshotAmountPaise ${inr(payload.screenshotAmountPaise)} stored for audit`,
          ),
        );
      }
    }

    const firstInvoice = invoices[0];
    if (firstInvoice) {
      checks.push(
        check(
          'approve.rent-invoice',
          firstInvoice.rentPaise === breakdown.rentDuePaise,
          `Rent invoice ${inr(firstInvoice.rentPaise)} (want booking rent ${inr(breakdown.rentDuePaise)})`,
        ),
      );
      if (primaryRes?.stayRange) {
        const parsed = parseDaterange(primaryRes.stayRange);
        const checkIn = parsed.lower ? formatDate(parsed.lower) : null;
        checks.push(
          check(
            'approve.billing-cycle',
            firstInvoice.billingMonth === checkIn?.slice(0, 7) || Boolean(checkIn),
            `Rent invoice month ${firstInvoice.billingMonth} · check-in ${checkIn ?? '—'} (must anchor to booking check-in, not approval date)`,
          ),
        );
      }
    }

    const collected = ledger.find((e) => e.kind === 'collected');
    if (collected) {
      checks.push(
        check(
          'approve.deposit-ledger',
          collected.amountPaise === breakdown.depositCashDuePaise,
          `Deposit collected ${inr(collected.amountPaise)} (want ${inr(breakdown.depositCashDuePaise)})`,
        ),
      );
    }
  }

  const audit = await loadBookingPaymentVerificationAudit(booking.id);
  if (audit) {
    checks.push(
      check(
        'audit.expected',
        audit.expectedContractPaise === expectedContract,
        `Audit expected ${inr(audit.expectedContractPaise)}`,
      ),
      check(
        'audit.screenshot',
        audit.screenshotAmountPaise === screenshotAmountPaiseFromProofRecord({
          proofSnapshotSubmittedPaise: activeProof?.proofSnapshotSubmittedPaise ?? null,
          confirmedAmountPaise: activeProof?.confirmedAmountPaise ?? null,
          amountPaise: activeProof?.amountPaise ?? 0,
        }),
        `Audit screenshot ${inr(audit.screenshotAmountPaise)}`,
      ),
      check(
        'audit.status',
        audit.status === 'approved' || audit.status === 'rejected',
        `Audit status ${audit.status}`,
      ),
    );
  } else if (activeProof?.status === 'approved') {
    checks.push(check('audit.section', false, 'Approved proof exists but booking audit section would be empty.'));
  }

  checks.push(
    check(
      'regression.no-allocation-approve',
      !JSON.stringify(proofs).includes('paymentAllocation'),
      'No payment allocation payload on proof records.',
    ),
  );

  return { bookingCode, checks };
}

async function main() {
  const explicit = readFlags('--booking-code');
  const discover = process.argv.includes('--discover-corrupt');
  let codes = explicit.length > 0 ? explicit : DEFAULT_CODES;

  if (discover) {
    const found = await discoverCorruptBookingCodes();
    codes = [...new Set([...codes, ...found])];
    console.log(`Discovered corrupt-proof bookings: ${found.join(', ') || '(none)'}`);
  }

  let allPass = true;
  for (const code of codes) {
    console.log(`\n=== ${code} ===`);
    const result = await verifyBooking(code);
    for (const c of result.checks) {
      const mark = c.pass ? 'PASS' : 'FAIL';
      console.log(`  [${mark}] ${c.id}: ${c.detail}`);
      if (!c.pass) allPass = false;
    }
  }

  await closeDb();
  if (!allPass) process.exit(1);
  console.log('\nAll regression checks passed.');
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
