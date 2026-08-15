import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatRentSuccessMessage,
  ratesFromBeds,
} from '@/src/components/admin/rooms/roomCardFormatters';

test('updateRoomPricingAction returns persisted rates shape', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(admin)/admin/pgs/inventory-actions.ts'),
    'utf8',
  );
  assert.match(src, /export type UpdateRoomPricingSuccess/);
  assert.match(src, /rates:\s*\{/);
  assert.match(src, /dailyPaise: rates\.dailyRatePaise/);
  assert.match(src, /return\s*\{\s*ok: true,\s*rates:/);
});

test('updateRoomBedPricing returns RoomBedPricingResult', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(src, /export type RoomBedPricingResult/);
  assert.match(src, /Promise<RoomBedPricingResult>/);
  assert.match(src, /bedCount: roomBeds\.length/);
});

test('resizeRoomCapacity returns capacity and room type', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(src, /export type ResizeRoomCapacityResult/);
  assert.match(src, /targetBedCount: input\.targetBedCount/);
  assert.match(src, /roomTypeName: input\.roomTypeName/);
});

test('formatRentSuccessMessage includes all rate tiers', () => {
  const msg = formatRentSuccessMessage({
    dailyPaise: 50000,
    weeklyPaise: 300000,
    monthlyPaise: 450000,
  });
  assert.match(msg, /Rent updated/);
  assert.match(msg, /Monthly/);
  assert.match(msg, /Weekly/);
  assert.match(msg, /Daily/);
});

test('ratesFromBeds reads first bed pricing', () => {
  const rates = ratesFromBeds([
    {
      bedId: 'b1',
      bedCode: 'A1',
      bedStatus: 'available',
      roomId: 'r1',
      roomNumber: '101',
      floorNumber: 1,
      floorLabel: 'Floor 1',
      roomTypeId: 't1',
      roomTypeName: '2 Sharing',
      sharingCount: 2,
      hasAc: false,
      roomNotes: null,
      listingDescription: null,
      images: [],
      videos: [],
      dimensions: {},
      dailyRatePaise: 10000,
      weeklyRatePaise: 60000,
      monthlyRatePaise: 200000,
      dailyDepositPaise: 0,
      weeklyDepositPaise: 0,
      monthlyDepositPaise: 0,
    },
  ]);
  assert.deepEqual(rates, {
    dailyPaise: 10000,
    weeklyPaise: 60000,
    monthlyPaise: 200000,
  });
});

test('PgRoomOperationsPanel uses operational room cards', () => {
  const panel = readFileSync(
    join(process.cwd(), 'src/components/admin/PgRoomOperationsPanel.tsx'),
    'utf8',
  );
  assert.match(panel, /RoomOperationalCard/);
  assert.doesNotMatch(panel, /RoomConfigurationEditor/);
  assert.match(panel, /RoomPricingQuickTable/);
  assert.match(panel, /useOperationsActionToast/);
});
