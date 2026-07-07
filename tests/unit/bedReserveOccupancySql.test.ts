import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BED_RESERVE_HOLD_INVENTORY_STATUS_SQL,
  bedReserveHoldCheckInLateralSql,
} from '@/src/lib/reservationLifecycle/bedReserveOccupancySql';

test('inventory status SQL includes under_review and active holds', () => {
  assert.match(BED_RESERVE_HOLD_INVENTORY_STATUS_SQL, /under_review/);
  assert.match(BED_RESERVE_HOLD_INVENTORY_STATUS_SQL, /active/);
  assert.match(BED_RESERVE_HOLD_INVENTORY_STATUS_SQL, /pending_payment/);
  assert.doesNotMatch(BED_RESERVE_HOLD_INVENTORY_STATUS_SQL, /reserve_start/);
});

test('check-in lateral SQL does not gate on reserve_start', () => {
  const lateral = bedReserveHoldCheckInLateralSql('b.id');
  assert.match(lateral, /check_in_date >= CURRENT_DATE/);
  assert.doesNotMatch(lateral, /reserve_start/);
});
