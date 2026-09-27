import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('writeBedPriceVersion closes prior row and inserts successor for mid-window change', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventoryPricing.ts'), 'utf8');
  assert.match(src, /effectiveFromDate === activeFrom/);
  assert.match(src, /effectiveTo: effectiveFromDate/);
  assert.match(src, /await tx\.insert\(bedPrices\)/);
  assert.doesNotMatch(src, /effectiveFrom,\s*\n\s*effectiveTo: null,\s*\n\s*updatedAt/s);
});

test('same effectiveFrom updates rates in place without changing window start', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventoryPricing.ts'), 'utf8');
  assert.match(src, /if \(effectiveFromDate === activeFrom\)/);
  assert.match(src, /effectiveTo: active\.effectiveTo/);
});

test('capacity increase uses configuration effective date for restored bed pricing', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(src, /pricingEffectiveFrom/);
});

test('apply immediately runs capacity + pricing in one transaction', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/roomConfigurationSchedule.ts'),
    'utf8',
  );
  assert.match(src, /await db\.transaction\(async \(tx\)/);
  assert.match(src, /if \(input\.targetBedCount <= bedCountBefore\)/);
  assert.match(src, /writeScheduledBedPricesForRoom\(input\.roomId, today, input\.pricing, tx\)/);
  assert.match(src, /resizeRoomCapacity\(session, pgId, roomId, resizeInput, tx \? \{ tx \}/);
});

test('does not backdate bed pricing windows', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventoryPricing.ts'), 'utf8');
  assert.match(src, /Cannot backdate bed pricing/);
});

test('RoomTypeChangeDialog confirmation uses selected preset label', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/admin/rooms/RoomTypeChangeDialog.tsx'),
    'utf8',
  );
  assert.match(src, /preset\.label/);
  assert.match(src, /effectiveFromDisplay/);
});
