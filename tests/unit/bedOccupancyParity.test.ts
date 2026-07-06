import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBedOccupancy } from '@/src/lib/bedOccupancyResolve';

test('public/admin parity — under-review request shows unavailable', () => {
  const resolved = resolveBedOccupancy({
    bedId: 'bed-1',
    bedStatus: 'available',
    asOfDate: '2026-07-01',
    isOccupiedToday: false,
    manualOccupied: false,
    underReviewRequest: true,
    holdInterestCount: 1,
  });
  assert.equal(resolved.adminView.kind, 'under_review');
  assert.equal(resolved.isOpenNow, false);
  assert.match(resolved.adminView.label, /under review/i);
});

test('public/admin parity — draft hold interest does not block open beds', () => {
  const resolved = resolveBedOccupancy({
    bedId: 'bed-2',
    bedStatus: 'available',
    asOfDate: '2026-07-01',
    isOccupiedToday: false,
    manualOccupied: false,
    underReviewRequest: false,
    holdInterestCount: 2,
  });
  assert.equal(resolved.isOpenNow, true);
});
