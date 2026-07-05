import { strict as assert } from 'node:assert';
import test from 'node:test';
import { tryDiffDays } from '../../src/lib/dates.ts';
import { formatStayDateTime } from '../../src/lib/residents/stayBillingRules.ts';
import {
  buildMyBookingCardModels,
  normalizeMyBookingRow,
} from '../../src/lib/account/myBookingRowPresentation.ts';

/** Reproduces production crash: null status → status.replace is not a function */
const corruptDeveloperBooking = {
  id: 'booking-corrupt-1',
  bookingCode: 'AWG-DEV-001',
  status: null as unknown as string,
  durationMode: 'fixed_stay',
  expectedCheckoutDate: '2026-07-01',
  totalPaise: 150_000,
  discountPaise: 0,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  pgName: 'Awesome PG Test',
  pgSlug: 'awesome-pg-test',
  bedCount: 1,
  checkInDate: null,
};

test('tryDiffDays returns null when check-in is missing (resident context loader crash)', () => {
  assert.equal(tryDiffDays(null, '2026-07-01'), null);
  assert.equal(tryDiffDays(undefined, '2026-07-01'), null);
});

test('formatStayDateTime never throws for null check-in date', () => {
  assert.equal(formatStayDateTime(null, 'check-in'), 'Check-in date pending');
  assert.equal(formatStayDateTime('', 'check-out'), 'Check-out date pending');
});

test('normalizeMyBookingRow never throws when status is null (production crash)', () => {
  const model = normalizeMyBookingRow(corruptDeveloperBooking);
  assert.equal(model.status, 'invalid');
  assert.equal(model.statusLabel, 'Invalid');
  assert.match(model.warnings.join(' '), /missing booking status/i);
  assert.equal(model.isLinkable, true);
});

test('normalizeMyBookingRow handles fixed-stay booking with missing check-in', () => {
  const model = normalizeMyBookingRow({
    ...corruptDeveloperBooking,
    status: 'confirmed',
    durationMode: 'fixed_stay',
    checkInDate: null,
  });
  assert.equal(model.durationLabel, 'Short Stay');
  assert.equal(model.checkInLabel, null);
  assert.equal(model.status, 'confirmed');
});

test('normalizeMyBookingRow handles monthly open-ended booking', () => {
  const model = normalizeMyBookingRow({
    id: 'b-monthly',
    bookingCode: 'AWG-M-002',
    status: 'confirmed',
    durationMode: 'open_ended',
    totalPaise: 500_000,
    discountPaise: 0,
    pgName: 'Angatra PG',
    bedCount: 1,
    checkInDate: '2026-06-01',
  });
  assert.equal(model.durationLabel, 'Live here (Monthly)');
  assert.equal(model.checkInLabel, '1 June 2026');
});

test('normalizeMyBookingRow handles cancelled booking', () => {
  const model = normalizeMyBookingRow({
    id: 'b-cancel',
    bookingCode: 'AWG-C-003',
    status: 'cancelled',
    durationMode: 'weekly',
    totalPaise: 80_000,
    pgName: 'Test PG',
    bedCount: 1,
    checkInDate: '2026-05-01',
  });
  assert.equal(model.statusLabel, 'Cancelled');
  assert.equal(model.durationLabel, 'Short Stay');
});

test('normalizeMyBookingRow handles completed checkout booking', () => {
  const model = normalizeMyBookingRow({
    id: 'b-done',
    bookingCode: 'AWG-X-004',
    status: 'completed',
    durationMode: 'daily',
    totalPaise: 12_000,
    pgName: 'Test PG',
    bedCount: 1,
    checkInDate: '2026-04-01',
    expectedCheckoutDate: '2026-04-07',
  });
  assert.equal(model.status, 'completed');
  assert.equal(model.totalLabel, '₹120');
});

test('normalizeMyBookingRow surfaces warning card when booking code missing', () => {
  const model = normalizeMyBookingRow({
    id: 'b-no-code',
    bookingCode: '',
    status: 'confirmed',
    durationMode: 'monthly',
    totalPaise: 100,
    pgName: '',
    bedCount: 0,
    checkInDate: null,
  });
  assert.equal(model.isLinkable, false);
  assert.ok(model.warnings.length >= 2);
});

test('normalizeMyBookingRow handles superseded closed booking', () => {
  const model = normalizeMyBookingRow({
    id: 'b-super',
    bookingCode: 'APG-2026-0044',
    status: 'superseded',
    durationMode: 'monthly',
    totalPaise: 80_000,
    pgName: 'Test PG',
    bedCount: 1,
    checkInDate: '2026-05-01',
  });
  assert.equal(model.statusLabel, 'Superseded');
  assert.equal(model.isClosed, true);
  assert.equal(model.warnings.length, 0);
});

test('buildMyBookingCardModels maps mixed booking list without throwing', () => {
  const models = buildMyBookingCardModels([
    corruptDeveloperBooking,
    {
      id: 'b-good',
      bookingCode: 'AWG-OK-005',
      status: 'confirmed',
      durationMode: 'monthly',
      totalPaise: 200_000,
      pgName: 'Good PG',
      bedCount: 1,
      checkInDate: '2026-06-10',
    },
  ]);
  assert.equal(models.length, 2);
  assert.equal(models[0]?.status, 'invalid');
  assert.equal(models[1]?.status, 'confirmed');
});
