import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isGenericSharingRoomTypeName,
  resolveRoomTypeNameForCapacity,
  roomCapacityFromActiveBedCount,
  sharingLabelFromActiveBedCount,
} from '@/src/lib/roomCapacitySsot';

test('room capacity SSOT derives sharing from active bed count', () => {
  assert.equal(roomCapacityFromActiveBedCount(4), 4);
  assert.equal(roomCapacityFromActiveBedCount(3), 3);
  assert.equal(sharingLabelFromActiveBedCount(4), '4 Sharing');
  assert.equal(sharingLabelFromActiveBedCount(1), '1 Sharing');
});

test('generic sharing room type names refresh when beds change', () => {
  assert.equal(isGenericSharingRoomTypeName('5 Sharing'), true);
  assert.equal(isGenericSharingRoomTypeName('Tuition room'), false);
  assert.equal(resolveRoomTypeNameForCapacity('5 Sharing', 4), '4 Sharing');
  assert.equal(resolveRoomTypeNameForCapacity('Tuition room', 4), 'Tuition room');
});

test('archiveBed sync is wired in pgInventory', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(src, /syncRoomCapacityFromActiveBeds/);
  assert.match(src, /roomCapacitySsotDb/);
  assert.match(src, /export async function archiveBed[\s\S]*syncRoomCapacityFromActiveBeds/);
});

test('room page no longer mounts legacy electricity widget', () => {
  const panel = readFileSync(
    join(process.cwd(), 'src/components/admin/PgRoomOperationsPanel.tsx'),
    'utf8',
  );
  assert.doesNotMatch(panel, /RoomElectricityCard/);
  assert.doesNotMatch(panel, /roomMeters/);
});
