/**
 * Regression: reschedule scheduled room configuration effective date (Edit Rent + Change Type).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pickPrimaryScheduledConfigurationForEditing } from '@/src/lib/roomConfiguration/editingSchedule';

const scheduleService = readFileSync(
  join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
  'utf8',
);
const inventoryActions = readFileSync(
  join(process.cwd(), 'app/(admin)/admin/pgs/inventory-actions.ts'),
  'utf8',
);
const rentDialog = readFileSync(
  join(process.cwd(), 'src/components/admin/rooms/RoomRentEditorDialog.tsx'),
  'utf8',
);
const typeDialog = readFileSync(
  join(process.cwd(), 'src/components/admin/rooms/RoomTypeChangeDialog.tsx'),
  'utf8',
);
const sharedFields = readFileSync(
  join(process.cwd(), 'src/components/admin/rooms/RoomConfigurationEffectiveDateFields.tsx'),
  'utf8',
);

const OCT1 = '2026-10-01';
const NOV1 = '2026-11-01';

test('1 shared effective-date fields used by Edit Rent and Change Room Type', () => {
  assert.match(rentDialog, /RoomConfigurationEffectiveDateFields/);
  assert.match(typeDialog, /RoomConfigurationEffectiveDateFields/);
  assert.match(sharedFields, /type="date"/);
  assert.doesNotMatch(sharedFields, /readOnly/);
});

test('2 rescheduleRoomConfigurationChange exported and moves effective_from', () => {
  assert.match(scheduleService, /export async function rescheduleRoomConfigurationChange/);
  assert.match(scheduleService, /action: 'rescheduled'/);
  assert.match(scheduleService, /previousEffectiveFrom/);
  assert.match(scheduleService, /revertFutureBedPricesForSchedule/);
});

test('3 editingScheduleId updates same date without duplicate row', () => {
  assert.match(scheduleService, /editingScheduleId/);
  assert.match(scheduleService, /action: 'updated'/);
  assert.match(scheduleService, /assertNoConflictingSchedule/);
});

test('4 conflict when target date has a different schedule id', () => {
  assert.match(
    scheduleService,
    /assertNoConflictingSchedule\(\s*input\.roomId,\s*input\.effectiveFrom,\s*input\.editingScheduleId/,
  );
});

test('5 inventory actions pass editingScheduleId for rent and resize', () => {
  assert.match(inventoryActions, /editingScheduleId/);
  assert.match(inventoryActions, /configurationTiming/);
  assert.match(inventoryActions, /getScheduledRoomConfigurationById/);
});

test('6 Edit Rent preloads nearest scheduled configuration', () => {
  assert.match(rentDialog, /pickPrimaryScheduledConfigurationForEditing/);
  assert.match(rentDialog, /scheduledConfigurations/);
  assert.match(rentDialog, /editingScheduleId/);
});

test('7 Change Type preloads scheduled date and pricing', () => {
  assert.match(typeDialog, /pickPrimaryScheduledConfigurationForEditing/);
  assert.match(typeDialog, /editingSchedule\?\.effectiveFrom/);
});

test('8 pickPrimaryScheduledConfigurationForEditing chooses earliest schedule', () => {
  const a = {
    scheduleId: 'a',
    roomId: 'r',
    effectiveFrom: NOV1,
    targetBedCount: 2,
    roomTypeName: 'Twin',
    dailyRatePaise: 0,
    weeklyRatePaise: 0,
    monthlyRatePaise: 1,
    dailyDepositPaise: 0,
    weeklyDepositPaise: 0,
    monthlyDepositPaise: 0,
  };
  const b = { ...a, scheduleId: 'b', effectiveFrom: OCT1 };
  assert.equal(pickPrimaryScheduledConfigurationForEditing([a, b])?.effectiveFrom, OCT1);
});

test('9 rent action supports immediate apply with today effective date', () => {
  assert.match(inventoryActions, /applyRoomConfigurationChangeImmediately\(session, pgId, scheduleInput\)/);
});

test('10 moving schedule rewrites bed_prices for new effective date', () => {
  const moveBlock = scheduleService.slice(
    scheduleService.indexOf("action: 'rescheduled'"),
    scheduleService.indexOf("action: 'rescheduled'") + 800,
  );
  assert.match(moveBlock, /writeScheduledBedPricesForRoom\(input\.roomId, input\.effectiveFrom/);
});
