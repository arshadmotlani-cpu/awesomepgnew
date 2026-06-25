import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingDraftToSummaryData,
  hasBookingDraftSelection,
  quoteToBookingDraftPricing,
} from '../../src/lib/booking/bookingDraft';
import { stayTypeLabel } from '../../src/lib/stayType';

describe('bookingDraft SSOT', () => {
  it('detects selection by bed or room identifiers', () => {
    assert.equal(hasBookingDraftSelection({ bedId: 'b1' }), true);
    assert.equal(hasBookingDraftSelection({ bedCode: 'B5' }), true);
    assert.equal(hasBookingDraftSelection({ roomNumber: '203' }), true);
    assert.equal(hasBookingDraftSelection({}), false);
  });

  it('maps server quote into summary without UI math', () => {
    const pricing = quoteToBookingDraftPricing({
      subtotalPaise: 500_000,
      depositPaise: 250_000,
    });
    const summary = bookingDraftToSummaryData({
      pgName: 'Test PG',
      bedCode: 'B1',
      stayType: 'monthly_stay',
      checkIn: '2026-06-01',
      pricing,
    });
    assert.equal(summary.rentPaise, 500_000);
    assert.equal(summary.depositPaise, 250_000);
    assert.equal(summary.totalDuePaise, 750_000);
    assert.equal(summary.stayType, 'monthly_stay');
    assert.equal(stayTypeLabel('monthly_stay'), 'Live here (Monthly)');
  });
});
