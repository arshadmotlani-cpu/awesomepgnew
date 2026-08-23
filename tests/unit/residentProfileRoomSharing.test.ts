import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  roommateCountFromRoomCapacity,
  residentProfileRoomSharingLabel,
  resolveEffectiveRoomCapacity,
  roomCapacityFromActiveBedCount,
} from '@/src/lib/roomCapacitySsot';

test('3-sharing room shows 2 roommates (capacity minus self)', () => {
  assert.equal(roomCapacityFromActiveBedCount(3), 3);
  assert.equal(roommateCountFromRoomCapacity(3), 2);
  assert.equal(residentProfileRoomSharingLabel(3), '3-sharing (2 roommates)');
});

test('4-sharing room shows 3 roommates', () => {
  assert.equal(roommateCountFromRoomCapacity(4), 3);
  assert.equal(residentProfileRoomSharingLabel(4), '4-sharing (3 roommates)');
});

test('private / 1-sharing room is Private room', () => {
  assert.equal(roommateCountFromRoomCapacity(1), 0);
  assert.equal(residentProfileRoomSharingLabel(1), 'Private room');
});

test('effective capacity prefers active bed count over stored default', () => {
  assert.equal(
    resolveEffectiveRoomCapacity({ activeBedCount: 3, storedCapacity: 4 }),
    3,
  );
  assert.equal(
    resolveEffectiveRoomCapacity({ activeBedCount: 0, storedCapacity: 4 }),
    4,
  );
});

test('resident profile does not hardcode 4-sharing', () => {
  const section = readFileSync(
    join(process.cwd(), 'src/components/customer/account/ResidentAreaAsyncSections.tsx'),
    'utf8',
  );
  assert.doesNotMatch(section, /roomCapacity=\{4\}/);
  assert.doesNotMatch(section, /Math\.max\(0,\s*4\s*-\s*1\)/);
  assert.match(section, /roomCapacity=\{data\.roomCapacity\}/);
  assert.match(section, /roommatesCount=\{data\.roommatesCount\}/);

  const loader = readFileSync(
    join(process.cwd(), 'src/services/residentPortalTabData.ts'),
    'utf8',
  );
  assert.match(loader, /countActiveBedsInRoom/);
  assert.match(loader, /resolveEffectiveRoomCapacity/);
  assert.match(loader, /roommateCountFromRoomCapacity/);
});
