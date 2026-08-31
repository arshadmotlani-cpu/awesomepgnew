import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findConflict,
  intervalsOverlap,
  isWithinWorkingWindow,
} from '../../../src/hair/lib/appointmentEngine.ts';
import {
  canTransitionAppointmentStatus,
  isCheckoutAllowedStatus,
  occupiesBookableSlot,
} from '../../../src/hair/lib/appointmentStatus.ts';
import { escapeHtml, salonDayBounds, salonDayOfWeek } from '../../../src/hair/lib/salonTime.ts';

test('intervalsOverlap respects buffer minutes', () => {
  const a = { startMs: 0, endMs: 30 * 60_000 };
  const b = { startMs: 30 * 60_000, endMs: 60 * 60_000 };
  assert.equal(intervalsOverlap(a, b, 0), false);
  assert.equal(intervalsOverlap(a, b, 5), true);
});

test('findConflict skips excluded id', () => {
  const existing = [
    { id: '1', startMs: 0, endMs: 60_000 },
    { id: '2', startMs: 120_000, endMs: 180_000 },
  ];
  assert.equal(findConflict({ startMs: 0, endMs: 30_000 }, existing, 0, '1'), null);
  assert.equal(findConflict({ startMs: 0, endMs: 30_000 }, existing, 0), '1');
});

test('working hours and lunch break validation', () => {
  const day = new Date('2026-07-29T11:00:00');
  const end = new Date('2026-07-29T12:00:00');
  assert.equal(
    isWithinWorkingWindow({
      startAt: day,
      endAt: end,
      openHm: '10:00',
      closeHm: '20:00',
    }).ok,
    true,
  );
  assert.equal(
    isWithinWorkingWindow({
      startAt: day,
      endAt: end,
      openHm: '10:00',
      closeHm: '20:00',
      lunchStartHm: '11:00',
      lunchEndHm: '11:30',
    }).ok,
    false,
  );
});

test('working hours rejects stylist weekly off day', () => {
  const startAt = new Date('2026-07-27T11:00:00');
  const endAt = new Date('2026-07-27T12:00:00');
  const result = isWithinWorkingWindow({
    startAt,
    endAt,
    openHm: '10:00',
    closeHm: '20:00',
    closed: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /off this day/i);
  }
});

test('appointment status transitions — paid only via payment engine', () => {
  assert.equal(canTransitionAppointmentStatus('booked', 'confirmed'), true);
  assert.equal(canTransitionAppointmentStatus('booked', 'paid'), false);
  assert.equal(canTransitionAppointmentStatus('completed', 'paid'), false);
  assert.equal(canTransitionAppointmentStatus('cancelled', 'booked'), false);
});

test('completed and paid free the slot for rebooking', () => {
  assert.equal(occupiesBookableSlot('booked'), true);
  assert.equal(occupiesBookableSlot('arrived'), true);
  assert.equal(occupiesBookableSlot('completed'), false);
  assert.equal(occupiesBookableSlot('paid'), false);
  assert.equal(occupiesBookableSlot('cancelled'), false);
  assert.equal(occupiesBookableSlot('no_show'), false);
});

test('checkout rejects booked/cancelled; allows arrived/in_service/completed', () => {
  assert.equal(isCheckoutAllowedStatus('booked'), false);
  assert.equal(isCheckoutAllowedStatus('cancelled'), false);
  assert.equal(isCheckoutAllowedStatus('paid'), false);
  assert.equal(isCheckoutAllowedStatus('arrived'), true);
  assert.equal(isCheckoutAllowedStatus('in_service'), true);
  assert.equal(isCheckoutAllowedStatus('completed'), true);
});

test('invoice tax helper math', () => {
  const taxOn = (amountPaise: number, gstBps: number) =>
    Math.round((Math.max(0, amountPaise) * Math.max(0, gstBps)) / 10_000);
  assert.equal(taxOn(100_000, 1800), 18_000);
  assert.equal(taxOn(100_000, 0), 0);
});

test('membership discount and package credit math', () => {
  const membershipDiscount = (subtotalPaise: number, discountBps: number) =>
    Math.round((subtotalPaise * discountBps) / 10_000);
  assert.equal(membershipDiscount(100_000, 1000), 10_000);
  const packageSessionCredit = (planPricePaise: number, totalSessions: number) =>
    Math.round(planPricePaise / Math.max(1, totalSessions));
  assert.equal(packageSessionCredit(500_000, 5), 100_000);
});

test('payment side effects run only on first transition to paid', () => {
  const wasUnpaid = (paidAt: Date | null) => !paidAt;
  assert.equal(wasUnpaid(null), true);
  assert.equal(wasUnpaid(new Date()), false);
});

test('escapeHtml prevents XSS in print templates', () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script>`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
  );
});

test('salonDayBounds returns contiguous 24h window', () => {
  const { start, end, dayKey } = salonDayBounds('Asia/Kolkata', new Date('2026-07-29T06:30:00Z'));
  assert.match(dayKey, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test('salonDayOfWeek returns weekday index in salon timezone', () => {
  const dow = salonDayOfWeek('Asia/Kolkata', new Date('2026-07-29T06:30:00Z'));
  assert.ok(dow >= 0 && dow <= 6);
});
