/**
 * Scheduled room configuration apply — capacity reduction, atomicity, idempotency.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { planRoomCapacityDecrease } from '@/src/lib/roomCapacityBedPlanner';

const scheduleService = readFileSync(
  join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
  'utf8',
);
const inventory = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
const billingScheduler = readFileSync(
  join(process.cwd(), 'src/services/billingScheduler.ts'),
  'utf8',
);

test('Room 102 pattern: 3→2 with B1/B2 occupied archives empty B3 only', () => {
  const plan = planRoomCapacityDecrease({
    activeBeds: [
      { id: 'b1', bedCode: 'B1', occupied: true },
      { id: 'b2', bedCode: 'B2', occupied: true },
      { id: 'b3', bedCode: 'B3', occupied: false },
    ],
    targetBedCount: 2,
  });
  assert.equal(plan.blocked, false);
  assert.deepEqual(plan.archiveBedCodes, ['B3']);
  assert.deepEqual(plan.preserveBedIds, ['b1', 'b2']);
});

test('occupied surplus beds block capacity reduction', () => {
  const plan = planRoomCapacityDecrease({
    activeBeds: [
      { id: 'b1', bedCode: 'B1', occupied: true },
      { id: 'b2', bedCode: 'B2', occupied: true },
      { id: 'b3', bedCode: 'B3', occupied: true },
    ],
    targetBedCount: 2,
  });
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.archiveBedIds, []);
});

test('resizeRoomCapacity uses planRoomCapacityDecrease for decreases', () => {
  const resizeStart = inventory.indexOf('export async function resizeRoomCapacity');
  const resizeEnd = inventory.indexOf('export async function updateBedCode', resizeStart);
  const resizeFn = inventory.slice(resizeStart, resizeEnd);
  assert.match(resizeFn, /planRoomCapacityDecrease/);
  assert.doesNotMatch(resizeFn, /if \(block\) {\s*\n\s*throw new Error\(\s*\n\s*`Cannot reduce to \$\{input\.targetBedCount\} Sharing\. \$\{bed\.bedCode\} is blocked/);
});

test('applySingleRoomConfigurationSchedule runs inventory + status in one transaction', () => {
  const fnStart = scheduleService.indexOf('async function applySingleRoomConfigurationSchedule');
  const fnEnd = scheduleService.indexOf('export const SYSTEM_ROOM_CONFIGURATION_SESSION', fnStart);
  const fn = scheduleService.slice(fnStart, fnEnd);
  assert.match(fn, /await db\.transaction\(async \(tx\) =>/);
  assert.match(fn, /executeRoomConfigurationApply\([\s\S]*,\s*tx,/);
  assert.match(fn, /status: 'applied'/);
  assert.match(fn, /appliedAt: new Date\(\)/);
  assert.match(fn, /action: 'applied'/);
  assert.doesNotMatch(fn, /executeRoomConfigurationApply\([\s\S]*undefined,\s*\{\s*pricingEffectiveFrom/);
});

test('applyDueRoomConfigurationSchedules counts failures without aborting other rooms', () => {
  assert.match(scheduleService, /export type ApplyDueRoomConfigurationSchedulesResult/);
  assert.match(scheduleService, /failed \+= 1/);
  assert.match(scheduleService, /errors\.push/);
  assert.match(scheduleService, /if \(didApply\) applied \+= 1/);
});

test('billing scheduler logs partial room configuration apply failures', () => {
  assert.match(billingScheduler, /roomConfigApply\.failed > 0/);
});

test('scheduled apply uses schedule effective date for pricing on capacity increase only path', () => {
  assert.match(scheduleService, /pricingEffectiveFrom: row\.effectiveFrom/);
});

test('already-applied schedule is skipped (idempotent early return)', () => {
  const fnStart = scheduleService.indexOf('async function applySingleRoomConfigurationSchedule');
  const fnEnd = scheduleService.indexOf('export const SYSTEM_ROOM_CONFIGURATION_SESSION', fnStart);
  const fn = scheduleService.slice(fnStart, fnEnd);
  assert.match(fn, /row\.status !== 'scheduled'\) return false/);
});

test('cron apply uses system audit actor when adminId is not a UUID', () => {
  assert.match(scheduleService, /function auditActorForSession/);
  assert.match(scheduleService, /actorType: auditActor\.actorType/);
  assert.match(scheduleService, /actorId: auditActor\.actorId/);
});

test('deposit adjustment still runs after successful transactional apply', () => {
  const fnStart = scheduleService.indexOf('async function applySingleRoomConfigurationSchedule');
  const fnEnd = scheduleService.indexOf('export const SYSTEM_ROOM_CONFIGURATION_SESSION', fnStart);
  const fn = scheduleService.slice(fnStart, fnEnd);
  assert.match(fn, /await applyDepositAdjustmentsForRoom\(row\.roomId, row\.effectiveFrom/);
});
