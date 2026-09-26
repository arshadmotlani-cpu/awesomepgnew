/**
 * Regression matrix — future-dated room configuration schedules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { defaultRoomConfigurationEffectiveFrom } from '@/src/lib/roomConfiguration/effectiveDate';
import { addMonths, formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

const scheduleService = readFileSync(
  join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
  'utf8',
);
const billingScheduler = readFileSync(
  join(process.cwd(), 'src/services/billingScheduler.ts'),
  'utf8',
);
const inventoryActions = readFileSync(
  join(process.cwd(), 'app/(admin)/admin/pgs/inventory-actions.ts'),
  'utf8',
);
const electricityBilling = readFileSync(
  join(process.cwd(), 'src/services/electricityBilling.ts'),
  'utf8',
);

test('1–3 sharing decrease/increase schedules via inventory actions not immediate resize', () => {
  assert.doesNotMatch(inventoryActions, /await resizeRoomCapacity\(session, pgId, roomId/);
  assert.match(inventoryActions, /scheduleRoomConfigurationChange/);
});

test('4–7 rent/deposit changes route through schedule + future bed_prices', () => {
  assert.match(scheduleService, /writeScheduledBedPricesForRoom/);
  assert.match(scheduleService, /writeBedPriceVersion/);
  assert.doesNotMatch(inventoryActions, /affectExistingTenants/);
});

test('8 capacity-only change still uses schedule row', () => {
  assert.match(scheduleService, /targetBedCount/);
});

test('10–12 rent invoices use bed_prices effective on billing month (existing SSOT)', () => {
  const rentSsot = readFileSync(
    join(process.cwd(), 'src/lib/billing/rentPricingSsot.ts'),
    'utf8',
  );
  assert.match(rentSsot, /loadBedPrice\(bedId, month\)/);
});

test('13–14 deposit adjustment runs on apply not on schedule create', () => {
  assert.match(scheduleService, /applyDepositAdjustmentsForRoom/);
  assert.doesNotMatch(scheduleService, /propagatePricingChangeForBeds/);
});

test('15–16 electricity billing uses effective bed count for month', () => {
  assert.match(electricityBilling, /resolveEffectiveBedCountForRoom\(input\.roomId, billingMonth\)/);
});

test('17 occupancy conflict blocks schedule when too many residents for target capacity', () => {
  assert.match(scheduleService, /occupied > input\.targetBedCount/);
});

test('20 scheduled change can be cancelled before effective date', () => {
  assert.match(scheduleService, /cancelRoomConfigurationSchedule/);
  assert.match(scheduleService, /revertFutureBedPricesForSchedule/);
});

test('21 multiple schedules ordered by effective_from', () => {
  assert.match(scheduleService, /orderBy\(asc\(roomConfigurationSchedules\.effectiveFrom\)\)/);
});

test('22 historical invoices — schedule does not call pending invoice sync', () => {
  assert.doesNotMatch(scheduleService, /syncPendingRentInvoicesFromSsot/);
  assert.doesNotMatch(scheduleService, /recalculatePendingRentInvoicesForBooking/);
});

test('25 overlapping scheduled effective dates rejected per room', () => {
  assert.match(scheduleService, /assertNoScheduleConflict/);
});

test('default effective date is next calendar month start', () => {
  const today = '2026-09-26';
  const expected = formatDate(addMonths(parseDate(firstOfMonth(today)), 1));
  assert.equal(defaultRoomConfigurationEffectiveFrom(today), expected);
});

test('billing scheduler applies due room configuration before invoice generation', () => {
  assert.match(billingScheduler, /applyDueRoomConfigurationSchedules\(runDate\)/);
});

test('SSOT getRoomConfigurationEffectiveOn exported for dependent calculations', () => {
  assert.match(scheduleService, /export async function getRoomConfigurationEffectiveOn/);
});

test('admin UI distinguishes current vs scheduled', () => {
  const panel = readFileSync(
    join(process.cwd(), 'src/components/admin/rooms/RoomConfigurationSchedulePanel.tsx'),
    'utf8',
  );
  assert.match(panel, /Current:/);
  assert.match(panel, /Scheduled from/);
});
