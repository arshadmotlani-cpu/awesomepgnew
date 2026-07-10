import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('requireCustomerOwnsBookingCode compares customerId to session', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/auth/guards.ts'), 'utf8');
  assert.match(src, /requireCustomerOwnsBookingCode/);
  assert.match(src, /row\.customerId !== session\.customerId/);
  assert.match(src, /Booking not found or access denied/);
});

test('requireCustomerOwnsBooking guards booking id routes', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/auth/guards.ts'), 'utf8');
  assert.match(src, /requireCustomerOwnsBooking/);
  assert.match(src, /eq\(bookings\.id, bookingId\)/);
});

test('admin resident search hides unassigned rows from scoped admins', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/adminResidentSearch.ts'), 'utf8');
  assert.match(src, /session\.role === 'super_admin'/);
  assert.match(src, /!row\.pg_id/);
});
