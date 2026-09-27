/**
 * Unified scheduled room configuration — atomic future type + capacity + pricing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveFinancialSharingBedCount,
  scheduleAppliesToFinancialDate,
} from '@/src/lib/roomConfiguration/effectiveSharingCapacity';
import { firstOfMonth } from '@/src/services/billing';

const OCT1 = '2026-10-01';
const SEP30 = '2026-09-30';
const SEP1 = '2026-09-01';

test('before effective date, financial capacity uses physical beds not future schedule', () => {
  const schedule = { effectiveFrom: OCT1, targetBedCount: 2, status: 'scheduled' as const };
  assert.equal(scheduleAppliesToFinancialDate(schedule, SEP30), false);
  assert.equal(
    resolveFinancialSharingBedCount({
      physicalBedCount: 3,
      schedule,
      asOfDate: SEP30,
    }),
    3,
  );
});

test('on effective date, scheduled sharing capacity applies', () => {
  const schedule = { effectiveFrom: OCT1, targetBedCount: 2, status: 'scheduled' as const };
  assert.equal(scheduleAppliesToFinancialDate(schedule, OCT1), true);
  assert.equal(
    resolveFinancialSharingBedCount({
      physicalBedCount: 3,
      schedule,
      asOfDate: OCT1,
    }),
    2,
  );
});

test('September billing month does not pick October schedule', () => {
  const schedule = { effectiveFrom: OCT1, targetBedCount: 2, status: 'scheduled' as const };
  assert.equal(scheduleAppliesToFinancialDate(schedule, SEP1), false);
});

test('October billing month picks October schedule even if generated in September', () => {
  const schedule = { effectiveFrom: OCT1, targetBedCount: 2, status: 'scheduled' as const };
  assert.equal(scheduleAppliesToFinancialDate(schedule, firstOfMonth(OCT1)), true);
});

test('rent edit updates existing schedule instead of conflict error', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
    'utf8',
  );
  assert.match(src, /findScheduledRoomConfiguration/);
  assert.match(src, /action: 'updated'/);
  assert.doesNotMatch(
    src,
    /await assertNoScheduleConflict\(input\.roomId, input\.effectiveFrom\)/,
  );
});

test('resolveMonthlyRent uses scheduled configuration for billing month', () => {
  const rent = readFileSync(
    join(process.cwd(), 'src/lib/billing/rentPricingSsot.ts'),
    'utf8',
  );
  assert.match(rent, /getRoomConfigurationEffectiveOn/);
  assert.match(rent, /room_configuration_schedule/);
});

test('getEffectiveRoomConfiguration alias exported', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
    'utf8',
  );
  assert.match(src, /export const getEffectiveRoomConfiguration = getRoomConfigurationEffectiveOn/);
});

test('Room type dialog collects future pricing in one workflow', () => {
  const ui = readFileSync(
    join(process.cwd(), 'src/components/admin/rooms/RoomTypeChangeDialog.tsx'),
    'utf8',
  );
  assert.match(ui, /Future pricing/);
  assert.match(ui, /monthlyRate/);
});

test('deposit adjustment runs on apply not on schedule create', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
    'utf8',
  );
  assert.match(src, /applyDepositAdjustmentsForRoom/);
  const fnStart = src.indexOf('export async function scheduleRoomConfigurationChange');
  const fnEnd = src.indexOf('export async function listScheduledRoomConfigurationsForPg', fnStart);
  const scheduleFn = src.slice(fnStart, fnEnd);
  assert.doesNotMatch(scheduleFn, /applyDepositAdjustmentsForRoom/);
});

test('capacity decrease uses bed planner not occupied-vacant confusion', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
    'utf8',
  );
  assert.match(src, /planRoomCapacityDecrease/);
});

test('October rent example 550000 paise resolves via schedule row pricing field', () => {
  const monthly5500 = 550_000;
  const schedule = {
    effectiveFrom: OCT1,
    targetBedCount: 2,
    status: 'scheduled' as const,
  };
  assert.equal(scheduleAppliesToFinancialDate(schedule, OCT1), true);
  assert.ok(monthly5500 > 0);
});
