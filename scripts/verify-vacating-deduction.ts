/* eslint-disable no-console */
/**
 * Verify vacating notice deduction — missing notice days × daily rent.
 *
 *   Scenario A — short notice (5 calendar days): deduction = 9 × dailyRate
 *   Scenario B — compliant notice (20 days): deduction = 0
 *   Scenario C — UNIQUE(booking) guard
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  beds,
  bookings,
  depositLedger,
} from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import { recordPaymentSuccess } from '../src/services/bookingLifecycle';
import {
  approveVacatingRequest,
  completeVacatingRequest,
  rejectVacatingRequest,
  submitVacatingRequest,
} from '../src/services/vacating';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { isBedAvailable } from '../src/services/availability';
import { computeNoticeDeduction } from '../src/services/billing';

function ok(label: string) { console.log(`  \u2713 ${label}`); }
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

async function pickFreeBed(start: Date, end: Date): Promise<string> {
  const candidates = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(64);
  for (const c of candidates) {
    if (await isBedAvailable({ bedId: c.id, startDate: start, endDate: end })) return c.id;
  }
  return fail('no free bed for the test window');
}

async function freshMonthlyBooking(label: string, phone: string): Promise<{ bookingId: string; depositPaise: number; monthlyRentPaise: number }> {
  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (60 + jitter) * 86400_000);
  const end = new Date(start.getTime() + 90 * 86400_000); // 3-month stay
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const bedId = await pickFreeBed(start, end);
  const created = await createBooking({
    bedIds: [bedId],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: { fullName: label, email: `${phone.replace(/\D/g, '')}@example.com`, phone, gender: 'other' },
  });
  if (!created.ok) fail(`createBooking ${label} failed`, created);
  const paid = await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_vac_pay_${label}_${Date.now()}`,
    amountPaise: created.totalPaise,
    bookingCode: created.bookingCode,
  });
  if (!paid.ok) fail(`recordPaymentSuccess ${label} failed`, paid);

  const [booking] = await db
    .select({ id: bookings.id, depositPaise: bookings.depositPaise, snapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, paid.bookingId))
    .limit(1);
  const snapshot = booking.snapshot as { perBed?: Array<{ monthlyRatePaise?: number }> } | null;
  const monthlyRentPaise = snapshot?.perBed?.reduce((a, b) => a + (b.monthlyRatePaise ?? 0), 0) ?? 0;
  return { bookingId: booking.id, depositPaise: booking.depositPaise, monthlyRentPaise };
}

async function main() {
  console.log('Verification — vacating notice deduction (missing days × daily rent)');
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log('\n[A] SHORT NOTICE — vacating in 5 calendar days');
  const a = await freshMonthlyBooking('VacBotShort', '+919999000801');
  ok(`booking with deposit=₹${a.depositPaise / 100}, monthlyRent=₹${a.monthlyRentPaise / 100}`);

  const noticeGiven = fmt(today);
  const vacatingDate = fmt(new Date(today.getTime() + 5 * 86400_000));
  const submit = await submitVacatingRequest({
    bookingId: a.bookingId,
    noticeGivenDate: noticeGiven,
    vacatingDate,
  });
  if (!submit.ok) fail('submit short-notice failed', submit);
  const expectedPenalty = computeNoticeDeduction(a.monthlyRentPaise, {
    noticeGivenDate: noticeGiven,
    vacatingDate,
  });
  if (submit.deductionPaise !== expectedPenalty) {
    fail(`expected penalty=${expectedPenalty}, got ${submit.deductionPaise}`, submit);
  }
  if (submit.noticeCompliant) fail('expected noticeCompliant=false');
  ok(`submitted: noticeCompliant=false, deduction=₹${expectedPenalty / 100}`);

  const dup = await submitVacatingRequest({
    bookingId: a.bookingId,
    noticeGivenDate: noticeGiven,
    vacatingDate: fmt(new Date(today.getTime() + 30 * 86400_000)),
  });
  if (dup.ok) fail('expected already_exists, got ok', dup);
  if (dup.kind !== 'already_exists') fail(`expected already_exists, got ${dup.kind}`, dup);
  ok('UNIQUE guard: 2nd submit rejected (already_exists)');

  const approved = await approveVacatingRequest({ requestId: submit.request.id });
  if (!approved.ok) fail('approve failed', approved);
  const completed = await completeVacatingRequest({ requestId: submit.request.id });
  if (!completed.ok) fail('complete failed', completed);
  ok(`completed: deduction=₹${completed.deductionPaise / 100}, refund=₹${completed.depositRefundPaise / 100}`);

  const ledgerA = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, a.bookingId));
  const kinds = ledgerA.map((r) => r.entryKind).sort();
  if (!kinds.includes('collected')) fail('missing collected ledger row', ledgerA);
  if (!kinds.includes('deducted')) fail('missing deducted ledger row', ledgerA);
  if (!kinds.includes('refunded')) fail('missing refunded ledger row', ledgerA);
  ok(`ledger contains [${kinds.join(', ')}]`);

  const summary = await getDepositSummaryForBooking(a.bookingId);
  if (!summary) fail('summary missing');
  if (summary.refundableBalancePaise !== 0) {
    fail(`expected balance=0 after complete, got ${summary.refundableBalancePaise}`, summary);
  }
  ok('refundable balance after completion = 0');

  const [b1] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, a.bookingId)).limit(1);
  if (b1.status !== 'completed') fail(`booking expected completed, got ${b1.status}`);
  ok(`booking status flipped to ${b1.status}`);

  console.log('\n[B] COMPLIANT NOTICE — vacating in 20 days');
  const b = await freshMonthlyBooking('VacBotLong', '+919999000802');
  const submitB = await submitVacatingRequest({
    bookingId: b.bookingId,
    noticeGivenDate: fmt(today),
    vacatingDate: fmt(new Date(today.getTime() + 20 * 86400_000)),
  });
  if (!submitB.ok) fail('submit compliant failed', submitB);
  if (!submitB.noticeCompliant) fail('expected noticeCompliant=true');
  if (submitB.deductionPaise !== 0) fail(`expected deduction=0, got ${submitB.deductionPaise}`);
  ok('submitted: noticeCompliant=true, deduction=0');

  const completedB = await completeVacatingRequest({ requestId: submitB.request.id });
  if (!completedB.ok) fail('complete (compliant) failed', completedB);
  if (completedB.deductionPaise !== 0) fail('expected deduction=0 on completion');
  if (completedB.depositRefundPaise !== b.depositPaise) {
    fail(`expected full refund=${b.depositPaise}, got ${completedB.depositRefundPaise}`, completedB);
  }
  ok(`completed: full deposit ₹${b.depositPaise / 100} refunded`);

  console.log('\n[C] wrong-state guards');
  const replayComplete = await completeVacatingRequest({ requestId: submitB.request.id });
  if (replayComplete.ok) fail('expected wrong_status on re-complete', replayComplete);
  if (replayComplete.kind !== 'wrong_status') fail(`expected wrong_status, got ${replayComplete.kind}`);
  ok('re-completing a completed request is rejected');

  console.log('\n[D] REJECT then RESUBMIT');
  const d = await freshMonthlyBooking('VacBotReject', '+919999000803');
  const first = await submitVacatingRequest({
    bookingId: d.bookingId,
    noticeGivenDate: fmt(today),
    vacatingDate: fmt(new Date(today.getTime() + 10 * 86400_000)),
  });
  if (!first.ok) fail('first submit failed', first);

  const rejected = await rejectVacatingRequest({
    requestId: first.request.id,
    reason: 'Need longer notice period',
  });
  if (!rejected.ok) fail('reject failed', rejected);

  const resubmit = await submitVacatingRequest({
    bookingId: d.bookingId,
    noticeGivenDate: fmt(today),
    vacatingDate: fmt(new Date(today.getTime() + 30 * 86400_000)),
  });
  if (!resubmit.ok) fail('resubmit after reject failed', resubmit);
  if (resubmit.request.id === first.request.id) {
    fail('expected a new vacating row after resubmit');
  }
  ok('resubmit after admin reject succeeds');

  console.log('\nAll vacating-deduction assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-vacating-deduction failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
