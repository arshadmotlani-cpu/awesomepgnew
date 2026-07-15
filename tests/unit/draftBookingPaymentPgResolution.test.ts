import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { primaryBedIdFromPricingSnapshot } from '@/src/db/queries/customer';
import type { PricingSnapshot } from '@/src/db/schema/bookings';

function fixtureSnapshot(bedId: string): PricingSnapshot {
  return {
    perBed: [
      {
        bedId,
        dailyRatePaise: 0,
        weeklyRatePaise: 0,
        monthlyRatePaise: 10_000_00,
        securityDepositPaise: 5_000_00,
        durationMode: 'fixed_stay',
        units: 1,
        lineTotalPaise: 10_000_00,
      },
    ],
    computedAt: '2026-07-15T00:00:00.000Z',
  };
}

describe('draft booking PG resolution for payment prep', () => {
  it('reads primary bed id from pricing snapshot for fixed_stay drafts', () => {
    assert.equal(
      primaryBedIdFromPricingSnapshot(fixtureSnapshot('bed-aaa-111')),
      'bed-aaa-111',
    );
  });

  it('returns null when snapshot has no beds (payment must not invent a PG)', () => {
    assert.equal(primaryBedIdFromPricingSnapshot({ perBed: [], computedAt: 'x' }), null);
    assert.equal(primaryBedIdFromPricingSnapshot(null), null);
    assert.equal(primaryBedIdFromPricingSnapshot(undefined), null);
  });

  it('getBookingByCode resolves PG from snapshot for every duration mode when reservations are absent', () => {
    const src = readFileSync(join(process.cwd(), 'src/db/queries/customer.ts'), 'utf8');
    assert.match(src, /primaryBedIdFromPricingSnapshot/);
    assert.match(
      src,
      /Five-state customer drafts intentionally have no bed_reservations/,
    );
    // Must NOT gate snapshot PG join on reserve-only durationMode.
    assert.doesNotMatch(
      src,
      /durationMode === 'reserve' && reservationRows\.length === 0 && !reserveStart/,
    );
    assert.match(src, /if \(!pg\.id\)/);
    assert.match(src, /innerJoin\(pgs, eq\(pgs\.id, floors\.pgId\)\)/);
  });
});

describe('Resident → My Stay → Payment PG prepare wiring', () => {
  it('deposit checkout requires booking.pg.id before payment categories', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(customer)/booking/[bookingCode]/pay/page.tsx'),
      'utf8',
    );
    assert.match(src, /getBookingByCode/);
    assert.match(src, /if \(!booking\.pg\.id\)/);
    assert.match(src, /ensureDefaultPaymentCategoriesForPg\(booking\.pg\.id\)/);
    assert.match(src, /getRentDepositBookingCategory\(booking\.pg\.id\)/);
  });

  it('rent payment page joins invoice → booking → bed → room → PG', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(customer)/account/resident/pay-rent/[invoiceId]/page.tsx'),
      'utf8',
    );
    assert.match(src, /innerJoin\(pgs, eq\(pgs\.id, rentInvoices\.pgId\)\)/);
    assert.match(src, /innerJoin\(beds, eq\(beds\.id, rentInvoices\.bedId\)\)/);
    assert.match(src, /innerJoin\(rooms, eq\(rooms\.id, beds\.roomId\)\)/);
    assert.match(src, /ensureDefaultPaymentCategoriesForPg\(row\.pgId\)/);
    assert.match(src, /getRentDepositBookingCategory\(row\.pgId\)/);
  });

  it('electricity payment page joins invoice → bed → room → floor.pgId and prepares categories', () => {
    const src = readFileSync(
      join(
        process.cwd(),
        'app/(customer)/account/resident/pay-electricity/[invoiceId]/page.tsx',
      ),
      'utf8',
    );
    assert.match(src, /pgId: floors\.pgId/);
    assert.match(src, /innerJoin\(rooms, eq\(rooms\.id, electricityBills\.roomId\)\)/);
    assert.match(src, /innerJoin\(beds, eq\(beds\.id, electricityInvoices\.bedId\)\)/);
    assert.match(src, /innerJoin\(floors, eq\(floors\.id, rooms\.floorId\)\)/);
    assert.match(src, /ensureDefaultPaymentCategoriesForPg\(row\.pgId\)/);
    assert.match(src, /getElectricityDailyCategory\(row\.pgId\)/);
  });
});
