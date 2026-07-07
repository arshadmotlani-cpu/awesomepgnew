import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

test('reservation lifecycle revalidate covers admin map, public PG, booking, bookings list, operations', () => {
  const src = read('src/lib/occupancyRevalidate.ts');
  assert.match(src, /revalidatePath\('\/admin\/operations', 'layout'\)/);
  assert.match(src, /revalidatePath\(`\/admin\/pgs\/\$\{input\.pgId\}\/map`\)/);
  assert.match(src, /revalidatePath\(`\/pgs\/\$\{input\.pgSlug\}`\)/);
  assert.match(src, /revalidatePath\(`\/booking\/\$\{input\.bookingCode\}`\)/);
  assert.match(src, /revalidatePath\('\/account\/bookings'\)/);
});

test('payment proof submit revalidates before API response', () => {
  const route = read('app/api/payment-record/booking/route.ts');
  const service = read('src/services/qrPayments.ts');
  assert.match(route, /revalidateReservationLifecycleViews/);
  assert.match(service, /revalidateReservationLifecycleViews\(\{ pgId, bookingCode: input\.bookingCode \}\)/);
});

test('reserve lifecycle mutations revalidate dependent views', () => {
  const bedReserve = read('src/services/bedReserve.ts');
  assert.match(bedReserve, /revalidateReservationLifecycleForBookingId/);
  assert.match(bedReserve, /revalidateReservationLifecycleForBookingIds/);
  const cron = read('app/api/cron/expire-bed-reserves/route.ts');
  assert.match(cron, /revalidateReservationLifecycleViews/);
  const bookingActions = read('app/(customer)/booking/[bookingCode]/actions.ts');
  assert.match(bookingActions, /revalidateReservationLifecycleViews/);
});

test('admin payment approval revalidates operations queue surfaces', () => {
  const payments = read('app/(admin)/admin/payments/actions.ts');
  const qr = read('src/services/qrPayments.ts');
  assert.match(payments, /revalidateReservationLifecycleViews/);
  assert.match(qr, /revalidateReservationLifecycleViews\(\{[\s\S]*bookingCode/);
});
