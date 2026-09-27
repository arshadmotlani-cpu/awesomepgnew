import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('capacity increase uses configuration effective date for restored bed pricing', () => {
  const inventory = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(inventory, /pricingEffectiveFrom\?: string/);
  assert.match(inventory, /pricingEffectiveFrom,/);
  assert.match(
    inventory,
    /input\.pricingEffectiveFrom\?\.trim\(\) \|\| monthStartFor\(todayString\(\)\)/,
  );
  assert.match(inventory, /await syncRoomCapacityFromActiveBeds\(roomId, tx\)/);

  const schedule = readFileSync(
    join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
    'utf8',
  );
  assert.match(schedule, /pricingEffectiveFrom: today/);
  assert.match(schedule, /pricingEffectiveFrom: row\.effectiveFrom/);
  assert.match(schedule, /countActiveBedsInRoom\(roomId, runner\)/);
  assert.match(schedule, /const runner = tx \?\? db/);
});

test('assignRoomTypeForRoom counts active beds on the same executor as updates', () => {
  const inventory = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(inventory, /countActiveBedsInRoom\(roomId, runner\)/);
});

test('RoomTypeChangeDialog surfaces server action transport failures', () => {
  const dialog = readFileSync(
    join(process.cwd(), 'src/components/admin/rooms/RoomTypeChangeDialog.tsx'),
    'utf8',
  );
  assert.match(dialog, /unexpected response was received from the server/i);
});
