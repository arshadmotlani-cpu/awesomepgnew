import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertImmediateEffectiveDate,
  assertScheduledEffectiveDate,
  defaultRoomConfigurationEffectiveFrom,
  minScheduledRoomConfigurationEffectiveFrom,
} from '@/src/lib/roomConfiguration/effectiveDate';

const scheduleService = readFileSync(
  join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
  'utf8',
);
const inventoryActions = readFileSync(
  join(process.cwd(), 'app/(admin)/admin/pgs/inventory-actions.ts'),
  'utf8',
);
const roomTypeDialog = readFileSync(
  join(process.cwd(), 'src/components/admin/rooms/RoomTypeChangeDialog.tsx'),
  'utf8',
);

const TODAY = '2026-09-27';
const TOMORROW = '2026-09-28';
const OCT1 = '2026-10-01';

test('immediate change with effective date = today is accepted', () => {
  assert.doesNotThrow(() => assertImmediateEffectiveDate(TODAY, TODAY));
});

test('immediate change rejects non-today effective date', () => {
  assert.throws(
    () => assertImmediateEffectiveDate(OCT1, TODAY),
    /requires the effective date to be today/,
  );
});

test('future scheduled effective date is accepted', () => {
  assert.doesNotThrow(() => assertScheduledEffectiveDate(OCT1, TODAY));
});

test('scheduled change rejects today (use Apply immediately)', () => {
  assert.throws(
    () => assertScheduledEffectiveDate(TODAY, TODAY),
    /Use Apply immediately for today/,
  );
});

test('invalid past scheduled date is rejected', () => {
  assert.throws(
    () => assertScheduledEffectiveDate('2026-09-26', TODAY),
    /cannot be in the past/,
  );
});

test('immediate mode does not create a schedule row — service exports apply immediately', () => {
  assert.match(scheduleService, /export async function applyRoomConfigurationChangeImmediately/);
  assert.match(scheduleService, /configuration_applied_immediately/);
  const immediateStart = scheduleService.indexOf(
    'export async function applyRoomConfigurationChangeImmediately',
  );
  const scheduleStart = scheduleService.indexOf(
    'export async function scheduleRoomConfigurationChange',
  );
  assert.ok(immediateStart >= 0 && scheduleStart > immediateStart);
  const immediateBody = scheduleService.slice(immediateStart, scheduleStart);
  assert.doesNotMatch(immediateBody, /insert\(roomConfigurationSchedules\)/);
});

test('scheduled mode still creates date-aware schedule rows', () => {
  assert.match(scheduleService, /insert\(roomConfigurationSchedules\)/);
  assert.match(scheduleService, /writeScheduledBedPricesForRoom/);
  assert.match(scheduleService, /assertScheduledEffectiveDate/);
});

test('inventory action routes immediate vs scheduled timing', () => {
  assert.match(inventoryActions, /configurationTiming/);
  assert.match(inventoryActions, /applyRoomConfigurationChangeImmediately/);
  assert.match(inventoryActions, /scheduleRoomConfigurationChange/);
});

test('RoomTypeChangeDialog exposes Apply immediately vs Schedule', () => {
  assert.match(roomTypeDialog, /RoomConfigurationEffectiveDateFields/);
  assert.match(roomTypeDialog, /configurationTiming/);
  const sharedFields = readFileSync(
    join(process.cwd(), 'src/components/admin/rooms/RoomConfigurationEffectiveDateFields.tsx'),
    'utf8',
  );
  assert.match(sharedFields, /Apply immediately/);
  assert.match(sharedFields, /Schedule for a date/);
});

test('default scheduled date remains next billing cycle', () => {
  assert.equal(defaultRoomConfigurationEffectiveFrom(TODAY), OCT1);
});

test('scheduled date picker minimum is after today', () => {
  assert.equal(minScheduledRoomConfigurationEffectiveFrom(TODAY), TOMORROW);
});
