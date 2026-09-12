/**
 * Room type / sharing capacity change — bed identity, code generation, planner SSOT.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareBedCodes,
  planRoomCapacityDecrease,
  planRoomCapacityIncrease,
} from '@/src/lib/roomCapacityBedPlanner';
import { buildRoomCapacityChangePreview } from '@/src/lib/roomCapacityChangePreview';
import { nextBedCodesForRoom } from '@/src/lib/roomSharing';

test('4 → 5: preserves B1-B4 UUIDs, reactivates archived B5 before insert', () => {
  const active = [
    { id: 'uuid-b1', bedCode: 'B1' },
    { id: 'uuid-b2', bedCode: 'B2' },
    { id: 'uuid-b3', bedCode: 'B3' },
    { id: 'uuid-b4', bedCode: 'B4' },
  ];
  const archived = [
    { id: 'uuid-b5-archived', bedCode: 'B5' },
    { id: 'uuid-b6-archived', bedCode: 'B6' },
  ];

  const plan = planRoomCapacityIncrease({
    activeBeds: active,
    archivedBeds: archived,
    bedsToAdd: 1,
  });

  assert.deepEqual(plan.preserveBedIds, ['uuid-b1', 'uuid-b2', 'uuid-b3', 'uuid-b4']);
  assert.deepEqual(plan.reactivateBedIds, ['uuid-b5-archived']);
  assert.deepEqual(plan.reactivatedBedCodes, ['B5']);
  assert.deepEqual(plan.createBedCodes, []);
});

test('4 → 6: reactivates B5 and B6, no new inserts', () => {
  const plan = planRoomCapacityIncrease({
    activeBeds: ['B1', 'B2', 'B3', 'B4'].map((code, i) => ({ id: `id-${code}`, bedCode: code })),
    archivedBeds: ['B5', 'B6'].map((code) => ({ id: `arch-${code}`, bedCode: code })),
    bedsToAdd: 2,
  });
  assert.deepEqual(plan.reactivatedBedCodes, ['B5', 'B6']);
  assert.deepEqual(plan.createBedCodes, []);
});

test('2 → 5: preserves existing, reactivates archived, then creates missing', () => {
  const plan = planRoomCapacityIncrease({
    activeBeds: [
      { id: 'b1', bedCode: 'B1' },
      { id: 'b2', bedCode: 'B2' },
    ],
    archivedBeds: [{ id: 'b3a', bedCode: 'B3' }],
    bedsToAdd: 3,
  });
  assert.deepEqual(plan.reactivatedBedCodes, ['B3']);
  assert.deepEqual(plan.createBedCodes, ['B4', 'B5']);
});

test('retry 4 → 5: idempotent when already at target (bedsToAdd=0)', () => {
  const plan = planRoomCapacityIncrease({
    activeBeds: ['B1', 'B2', 'B3', 'B4', 'B5'].map((c) => ({ id: c, bedCode: c })),
    archivedBeds: [],
    bedsToAdd: 0,
  });
  assert.deepEqual(plan.reactivateBedIds, []);
  assert.deepEqual(plan.createBedCodes, []);
});

test('5 → 4 with empty B5: archives B5 only', () => {
  const plan = planRoomCapacityDecrease({
    activeBeds: [
      { id: 'b1', bedCode: 'B1', occupied: true },
      { id: 'b2', bedCode: 'B2', occupied: true },
      { id: 'b3', bedCode: 'B3', occupied: false },
      { id: 'b4', bedCode: 'B4', occupied: false },
      { id: 'b5', bedCode: 'B5', occupied: false },
    ],
    targetBedCount: 4,
  });
  assert.equal(plan.blocked, false);
  assert.deepEqual(plan.archiveBedCodes, ['B5']);
  assert.deepEqual(plan.preserveBedIds, ['b1', 'b2', 'b3', 'b4']);
});

test('5 → 4 with occupied B5: blocked, zero archive', () => {
  const plan = planRoomCapacityDecrease({
    activeBeds: [
      { id: 'b1', bedCode: 'B1', occupied: false },
      { id: 'b2', bedCode: 'B2', occupied: false },
      { id: 'b3', bedCode: 'B3', occupied: false },
      { id: 'b4', bedCode: 'B4', occupied: false },
      { id: 'b5', bedCode: 'B5', occupied: true },
    ],
    targetBedCount: 4,
  });
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.archiveBedIds, []);
  assert.match(plan.blockMessage ?? '', /occupied/i);
});

test('nextBedCodesForRoom skips archived codes and continues prefix', () => {
  assert.deepEqual(nextBedCodesForRoom(['B1', 'B2', 'B3', 'B4', 'B5', 'B6'], 1), ['B7']);
  assert.deepEqual(nextBedCodesForRoom(['A1', 'A2', 'A3'], 1), ['A4']);
});

test('nextBedCodesForRoom never suggests codes that already exist in room history', () => {
  const codes = nextBedCodesForRoom(['B1', 'B2', 'B3', 'B4', 'B5'], 2);
  assert.deepEqual(codes, ['B6', 'B7']);
  assert.ok(!codes.includes('B5'));
});

test('rent unchanged in preview — same monthly rate per bed', () => {
  const preview = buildRoomCapacityChangePreview({
    currentBeds: [
      { bedCode: 'B1', status: 'available', occupied: true },
      { bedCode: 'B2', status: 'available', occupied: true },
      { bedCode: 'B3', status: 'available', occupied: false },
      { bedCode: 'B4', status: 'available', occupied: false },
    ],
    archivedBedCodes: ['B5'],
    targetBedCount: 5,
    targetLabel: '5 Sharing',
    monthlyRatePaise: 360_600,
  });
  assert.equal(preview.monthlyRatePaise, 360_600);
  const b5 = preview.lines.find((l) => l.bedCode === 'B5');
  assert.ok(b5);
  assert.equal(b5!.kind, 'reactivate');
  assert.ok(preview.lines.some((l) => l.bedCode === 'B1' && l.kind === 'existing'));
});

test('A-prefix room keeps A convention on increase', () => {
  const plan = planRoomCapacityIncrease({
    activeBeds: [
      { id: 'a1', bedCode: 'A1' },
      { id: 'a2', bedCode: 'A2' },
      { id: 'a3', bedCode: 'A3' },
      { id: 'a4', bedCode: 'A4' },
    ],
    archivedBeds: [],
    bedsToAdd: 1,
  });
  assert.deepEqual(plan.createBedCodes, ['A5']);
});

test('pgInventory uses transactional bed planner with reactivation', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(src, /planRoomCapacityIncrease/);
  assert.match(src, /addBedsToRoomInTx/);
  assert.match(src, /archivedAt: null/);
  assert.match(src, /db\.transaction/);
});

test('RoomTypeChangeDialog uses accurate capacity preview', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/admin/rooms/RoomTypeChangeDialog.tsx'),
    'utf8',
  );
  assert.match(src, /RoomCapacityChangePreview/);
  assert.match(src, /archivedBedCodes/);
  assert.doesNotMatch(src, /BedPreviewList/);
});

test('compareBedCodes natural sort B10 after B9', () => {
  assert.ok(compareBedCodes('B9', 'B10') < 0);
});
