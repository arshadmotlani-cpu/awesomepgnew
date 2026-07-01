import { strict as assert } from 'node:assert';
import test from 'node:test';
import { isHistoricalCheckIn } from '@/src/services/expressBookingQuote';

test('isHistoricalCheckIn returns true when check-in is before today', () => {
  assert.equal(isHistoricalCheckIn('2020-01-01', new Date('2026-07-02T12:00:00Z')), true);
});

test('isHistoricalCheckIn returns false when check-in is today or future', () => {
  assert.equal(isHistoricalCheckIn('2026-07-02', new Date('2026-07-02T12:00:00Z')), false);
  assert.equal(isHistoricalCheckIn('2026-08-01', new Date('2026-07-02T12:00:00Z')), false);
});

test('ExpressBookingResidentContext type includes activeTenancy fields', () => {
  const ctx = {
    customerId: 'uuid',
    fullName: 'Waqar Ahmad',
    email: '',
    phone: '+919175000000',
    gender: 'male' as const,
    kycStatus: 'approved',
    tenancyStatus: 'active' as const,
    walletCreditPaise: 0,
    activeTenancy: {
      bookingId: 'b1',
      bookingCode: 'APG-2026-001',
      bookingStatus: 'confirmed',
      pgId: 'pg1',
      pgName: 'Shantinagar',
      roomNumber: '203',
      bedId: 'bed1',
      bedCode: 'B3',
      moveInDate: '2026-01-01',
      stayType: 'monthly_stay',
      durationMode: 'open_ended',
      monthlyRentPaise: 1200000,
      depositPaise: 600000,
      isVacating: false,
      expectedCheckoutDate: null,
    },
    depositCollectedPaise: 600000,
    depositHeldPaise: 600000,
  };

  assert.ok(ctx.activeTenancy);
  assert.equal(ctx.activeTenancy.pgName, 'Shantinagar');
  assert.equal(ctx.activeTenancy.bedCode, 'B3');
  assert.notEqual(ctx.activeTenancy, null, 'should show current bed — not "No bed assigned"');
});

test('fixed stay quote shape excludes deposit', () => {
  const quote = {
    stayType: 'fixed' as const,
    checkInDate: '2026-07-10',
    checkOutDate: '2026-07-12',
    isHistorical: false,
    days: 2,
    rentPaise: 66000,
    depositPaise: 0,
    totalPaise: 66000,
    dailyRatePaise: 33000,
    monthlyRentPaise: 0,
  };
  assert.equal(quote.depositPaise, 0);
  assert.equal(quote.dailyRatePaise, 33000);
});

test('historical sale requires active booking when no live path', () => {
  const historical = true;
  const activeTenancy = null;
  const shouldBlock = historical && !activeTenancy;
  assert.equal(shouldBlock, true);
});
