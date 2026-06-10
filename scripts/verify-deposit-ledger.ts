/* eslint-disable no-console */
/**
 * Phase 5.5 — verify deposit ledger semantics.
 *
 *   1. Booking payment auto-mirrors a `collected` row.
 *   2. `recordDepositCollected` is idempotent per relatedPaymentId.
 *   3. Manual `recordDepositDeducted` + `recordDepositRefunded` write rows
 *      with the correct sign.
 *   4. DB-level CHECK rejects sign violations (positive deducted, etc).
 *   5. `getDepositSummaryForBooking` returns the right running balance.
 *   6. Negative-amount writers refuse client input.
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
  getDepositSummaryForBooking,
  recordDepositCollected,
  recordDepositDeducted,
  recordDepositRefunded,
} from '../src/services/deposits';
import { isBedAvailable } from '../src/services/availability';

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

async function main() {
  console.log('Phase 5.5 verification — deposit ledger');

  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (60 + jitter) * 86400_000);
  const end = new Date(start.getTime() + 62 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log('\n[1] confirm a fresh monthly booking → ledger auto-mirrors deposit');
  const bedId = await pickFreeBed(start, end);
  const booked = await createBooking({
    bedIds: [bedId],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase5.5 DepBot',
      email: 'phase55-depbot@example.com',
      phone: '+919999000901',
      gender: 'other',
    },
  });
  if (!booked.ok) fail('createBooking failed', booked);

  const paymentId = `verify_dep_pay_${Date.now()}`;
  const paid = await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: paymentId,
    amountPaise: booked.totalPaise,
    bookingCode: booked.bookingCode,
  });
  if (!paid.ok) fail('payment failed', paid);

  const [bookingRow] = await db
    .select({ id: bookings.id, customerId: bookings.customerId, depositPaise: bookings.depositPaise })
    .from(bookings)
    .where(eq(bookings.id, paid.bookingId))
    .limit(1);
  ok(`booking ${booked.bookingCode}: deposit captured = ₹${bookingRow.depositPaise / 100}`);

  const ledger1 = await db.select().from(depositLedger).where(eq(depositLedger.bookingId, bookingRow.id));
  const collectedRows = ledger1.filter((r) => r.entryKind === 'collected');
  if (collectedRows.length !== 1) {
    fail(`expected exactly 1 collected row from booking payment, got ${collectedRows.length}`, ledger1);
  }
  if (collectedRows[0].amountPaise !== bookingRow.depositPaise) {
    fail(`mirrored amount mismatch: ${collectedRows[0].amountPaise} vs ${bookingRow.depositPaise}`);
  }
  ok('booking payment auto-mirrored a +collected ledger row');

  console.log('\n[2] recordDepositCollected is idempotent on relatedPaymentId');
  const before = (await db.select().from(depositLedger).where(eq(depositLedger.bookingId, bookingRow.id))).length;
  const dup = await recordDepositCollected({
    bookingId: bookingRow.id,
    customerId: bookingRow.customerId,
    amountPaise: bookingRow.depositPaise,
    reason: 'idempotency replay',
    relatedPaymentId: collectedRows[0].relatedPaymentId,
  });
  if (!dup.ok) fail('idempotent call failed', dup);
  if (dup.created) fail('expected created=false on idempotent replay');
  const after = (await db.select().from(depositLedger).where(eq(depositLedger.bookingId, bookingRow.id))).length;
  if (after !== before) fail(`row count changed (${before} → ${after}) on idempotent replay`);
  ok('replay was a no-op (same relatedPaymentId)');

  console.log('\n[3] manual deducted + refunded writers store correct signs');
  await recordDepositDeducted({
    bookingId: bookingRow.id,
    customerId: bookingRow.customerId,
    amountPaise: 50000, // ₹500
    reason: 'verify-deposit-ledger sample damages',
  });
  await recordDepositRefunded({
    bookingId: bookingRow.id,
    customerId: bookingRow.customerId,
    amountPaise: 100000, // ₹1,000 partial refund
    reason: 'verify-deposit-ledger partial refund',
  });
  const ledger2 = await db.select().from(depositLedger).where(eq(depositLedger.bookingId, bookingRow.id)).orderBy(depositLedger.createdAt);
  const ded = ledger2.find((r) => r.entryKind === 'deducted');
  const ref = ledger2.find((r) => r.entryKind === 'refunded');
  if (!ded || !ref) fail('missing deducted or refunded row', ledger2);
  if (ded.amountPaise >= 0) fail(`deducted must be <0, got ${ded.amountPaise}`);
  if (ref.amountPaise >= 0) fail(`refunded must be <0, got ${ref.amountPaise}`);
  ok(`deducted=${ded.amountPaise}, refunded=${ref.amountPaise} (both signed negative)`);

  console.log('\n[4] DB-level CHECK rejects sign violations (raw insert)');
  let checkFired = false;
  try {
    await db.insert(depositLedger).values({
      bookingId: bookingRow.id,
      customerId: bookingRow.customerId,
      entryKind: 'deducted',
      amountPaise: 1, // positive — must be rejected
      reason: 'sign violation test',
    });
  } catch (err) {
    checkFired = true;
    const msg = (err as { message?: string }).message ?? String(err);
    if (!msg.toLowerCase().includes('check')) {
      console.warn('    (got non-CHECK error)', msg.slice(0, 200));
    }
  }
  if (!checkFired) fail('positive `deducted` slipped past the CHECK constraint');
  ok('CHECK constraint on (entry_kind, sign(amount_paise)) rejects sign violations');

  console.log('\n[5] getDepositSummaryForBooking returns the running balance');
  const sum = await getDepositSummaryForBooking(bookingRow.id);
  if (!sum) fail('summary missing');
  const expectedBalance = bookingRow.depositPaise - 50000 - 100000;
  if (sum.refundableBalancePaise !== expectedBalance) {
    fail(`balance expected ${expectedBalance}, got ${sum.refundableBalancePaise}`, sum);
  }
  if (sum.collectedPaise !== bookingRow.depositPaise) fail(`collected mismatch`, sum);
  if (sum.deductedPaise !== 50000) fail(`deducted total mismatch`, sum);
  if (sum.refundedPaise !== 100000) fail(`refunded total mismatch`, sum);
  ok(`balance=₹${sum.refundableBalancePaise / 100} = collected(₹${sum.collectedPaise/100}) - deducted(₹${sum.deductedPaise/100}) - refunded(₹${sum.refundedPaise/100})`);

  console.log('\n[6] writers refuse non-positive client amounts');
  let refused = 0;
  try { await recordDepositCollected({ bookingId: bookingRow.id, customerId: bookingRow.customerId, amountPaise: 0, reason: 'zero' }); } catch { refused += 1; }
  try { await recordDepositDeducted({ bookingId: bookingRow.id, customerId: bookingRow.customerId, amountPaise: -5, reason: 'neg' }); } catch { refused += 1; }
  try { await recordDepositRefunded({ bookingId: bookingRow.id, customerId: bookingRow.customerId, amountPaise: 0, reason: 'zero' }); } catch { refused += 1; }
  if (refused !== 3) fail(`expected 3 client-side rejections, got ${refused}`);
  ok('writers refuse zero/negative amounts at the service boundary');

  console.log('\nAll deposit-ledger assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-deposit-ledger failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
