import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  bookingPolicySections,
  getBookingPolicies,
  getInvoiceStayPolicyNote,
} from '../../src/lib/booking/bookingPolicies';

test('monthly stay policies include notice period', () => {
  const policies = getBookingPolicies('monthly_stay');
  assert.equal(policies.stayType, 'monthly_stay');
  if (policies.stayType !== 'monthly_stay') return;
  assert.match(policies.noticePolicy.body, /14-day notice/);
  assert.match(policies.noticePolicy.body, /move-out request/);
  assert.doesNotMatch(policies.cancellationPolicy.body, /checkout date/);
});

test('fixed date stay policies have stay period, not notice requirement', () => {
  const policies = getBookingPolicies('fixed_date_stay');
  assert.equal(policies.stayType, 'fixed_date_stay');
  if (policies.stayType !== 'fixed_date_stay') return;
  assert.match(policies.stayPeriodPolicy.body, /checkout date/);
  assert.doesNotMatch(policies.stayPeriodPolicy.body, /14-day/);
  assert.doesNotMatch(policies.stayPeriodPolicy.body, /notice required/);
  assert.match(policies.stayPeriodPolicy.body, /No move-out request or notice period is required/);
});

test('bookingPolicySections never shows notice period for fixed date', () => {
  const fixed = bookingPolicySections(getBookingPolicies('fixed_date_stay'));
  const joined = fixed.map((s) => s.body).join(' ');
  assert.doesNotMatch(joined, /14-day notice/);
  assert.doesNotMatch(joined, /notice required/);
  assert.doesNotMatch(fixed[0]?.title ?? '', /Notice period/);
});

test('invoice stay policy note matches stay type', () => {
  assert.match(getInvoiceStayPolicyNote('monthly_stay') ?? '', /14-day notice/);
  const fixed = getInvoiceStayPolicyNote('fixed_date_stay') ?? '';
  assert.match(fixed, /checkout date/);
  assert.doesNotMatch(fixed, /14-day/);
});
