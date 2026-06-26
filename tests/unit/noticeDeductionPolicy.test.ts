import { strict as assert } from 'node:assert';
import test from 'node:test';
import { noticeDeductionAppliesToBooking } from '../../src/lib/checkout/noticeDeductionPolicy';

test('fixed stay bookings never get notice deductions', () => {
  assert.equal(
    noticeDeductionAppliesToBooking({ stayType: 'fixed_date_stay', durationMode: 'fixed_stay' }),
    false,
  );
  assert.equal(noticeDeductionAppliesToBooking({ durationMode: 'daily' }), false);
  assert.equal(noticeDeductionAppliesToBooking({ durationMode: 'weekly' }), false);
});

test('monthly bookings may get notice deductions', () => {
  assert.equal(
    noticeDeductionAppliesToBooking({ stayType: 'monthly_stay', durationMode: 'open_ended' }),
    true,
  );
  assert.equal(noticeDeductionAppliesToBooking({ durationMode: 'monthly' }), true);
  assert.equal(noticeDeductionAppliesToBooking({ durationMode: 'open_ended' }), true);
});
