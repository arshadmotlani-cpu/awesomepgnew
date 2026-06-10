import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _testing } from '../../src/services/booking';
import type { BookingQuote } from '../../src/services/pricing';

const { buildSnapshot } = _testing;

function makeQuote(): BookingQuote {
  return {
    startDate: '2026-07-01',
    endDate: '2026-08-01',
    durationMode: 'monthly',
    perBed: [
      {
        bedId: 'bed-aaa',
        durationMode: 'monthly',
        startDate: '2026-07-01',
        endDate: '2026-08-01',
        nights: 31,
        units: 1,
        rate: {
          bedPriceId: 'bp-1',
          dailyRatePaise: 100_000,
          weeklyRatePaise: 600_000,
          monthlyRatePaise: 1_800_000,
          securityDepositPaise: 1_800_000,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
        },
        lineItems: [
          {
            kind: 'monthly_cycle',
            description: '1 month @ monthly rate',
            units: 1,
            unitPricePaise: 1_800_000,
            amountPaise: 1_800_000,
          },
          {
            kind: 'pro_rata_days',
            description: '1 pro-rata day',
            units: 1,
            unitPricePaise: 100_000,
            amountPaise: 100_000,
          },
        ],
        subtotalPaise: 1_900_000,
        depositPaise: 1_800_000,
        totalPaise: 3_700_000,
        computedAt: '2026-06-30T12:00:00.000Z',
      },
    ],
    subtotalPaise: 1_900_000,
    depositPaise: 1_800_000,
    totalPaise: 3_700_000,
    computedAt: '2026-06-30T12:00:00.000Z',
  };
}

describe('booking snapshot', () => {
  it('mirrors the PricingSnapshot contract field-for-field', () => {
    const snap = buildSnapshot(makeQuote());
    assert.equal(snap.perBed.length, 1);
    const line = snap.perBed[0];
    assert.equal(line.bedId, 'bed-aaa');
    assert.equal(line.durationMode, 'monthly');
    assert.equal(line.dailyRatePaise, 100_000);
    assert.equal(line.weeklyRatePaise, 600_000);
    assert.equal(line.monthlyRatePaise, 1_800_000);
    assert.equal(line.securityDepositPaise, 1_800_000);
    assert.equal(line.units, 1);
    // lineTotalPaise is per-bed RENT only — deposits are summed separately
    // into bookings.deposit_paise. This is what keeps the invariant
    //   Σ perBed[i].lineTotalPaise === bookings.subtotal_paise
    // true, so the customer-facing ledger lines visually add up to Subtotal.
    assert.equal(line.lineTotalPaise, 1_900_000);
    assert.equal(snap.computedAt, '2026-06-30T12:00:00.000Z');
  });

  it('Σ perBed[i].lineTotalPaise equals booking subtotal', () => {
    const quote = makeQuote();
    // Add a second bed to force the multi-bed sum check.
    quote.perBed.push({
      ...quote.perBed[0],
      bedId: 'bed-bbb',
      subtotalPaise: 1_500_000,
      depositPaise: 1_200_000,
      totalPaise: 2_700_000,
    });
    quote.subtotalPaise = 1_900_000 + 1_500_000;
    quote.depositPaise = 1_800_000 + 1_200_000;
    quote.totalPaise = quote.subtotalPaise + quote.depositPaise;

    const snap = buildSnapshot(quote);
    const linesSum = snap.perBed.reduce((a, l) => a + l.lineTotalPaise, 0);
    assert.equal(linesSum, quote.subtotalPaise);
  });

  it('passes through optional notes', () => {
    const snap = buildSnapshot(makeQuote(), 'arrives 6pm');
    assert.equal(snap.notes, 'arrives 6pm');
  });

  it('omits notes when not provided', () => {
    const snap = buildSnapshot(makeQuote());
    assert.equal(snap.notes, undefined);
  });
});
