import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicAlwaysOccupiedPg } from '../../src/lib/publicPgAvailabilityOverrides';
import { canBookBed } from '../../src/components/customer/customerBedUi';

test('public always-occupied override matches targeted PG identities', () => {
  assert.equal(isPublicAlwaysOccupiedPg({ pgSlug: 'it-park' }), true);
  assert.equal(isPublicAlwaysOccupiedPg({ pgSlug: 'central-avenue-male' }), true);
  assert.equal(isPublicAlwaysOccupiedPg({ pgName: 'IT Park' }), true);
  assert.equal(isPublicAlwaysOccupiedPg({ pgName: 'Central Avenue (Male)' }), true);
  assert.equal(isPublicAlwaysOccupiedPg({ pgName: 'Central Avenue (Female)' }), false);
  assert.equal(isPublicAlwaysOccupiedPg({ pgName: 'Shanti Nagar - Awesome PG' }), false);
});

test('forcePublicOccupied blocks customer booking eligibility', () => {
  const bed = {
    bedId: 'b1',
    bedCode: 'B1',
    forcePublicOccupied: true,
    status: 'available' as const,
    isAvailableNow: true,
    nextAvailableDate: '2026-07-10',
    dailyRatePaise: 1000,
    weeklyRatePaise: 6000,
    monthlyRatePaise: 20000,
    securityDepositPaise: 5000,
    dailySecurityDepositPaise: 1000,
    weeklySecurityDepositPaise: 2000,
    monthlySecurityDepositPaise: 5000,
  };
  assert.equal(canBookBed(bed), false);
});

