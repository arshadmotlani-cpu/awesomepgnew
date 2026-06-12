import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveBedAvailabilityView, deriveCustomerBedAvailabilityView } from '../../src/lib/bedAvailabilityState';
import { customerBookableFromDate, isOpenEndedStayEnd } from '../../src/lib/dates';

test('isOpenEndedStayEnd treats 2099 sentinel as open-ended', () => {
  assert.equal(isOpenEndedStayEnd('2099-01-01'), true);
  assert.equal(isOpenEndedStayEnd('2027-06-01'), false);
  assert.equal(isOpenEndedStayEnd(null), false);
});

test('customerBookableFromDate strips open-ended sentinel', () => {
  assert.equal(customerBookableFromDate('2099-01-01'), null);
  assert.equal(customerBookableFromDate('2027-03-15'), '2027-03-15');
});

test('occupied open-ended stay shows Occupied not Available soon', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: false,
    nextAvailableDate: '2099-01-01',
    vacatingDate: null,
    vacatingStatus: null,
    reservedFrom: null,
  });
  assert.equal(view.kind, 'occupied');
  assert.equal(view.label, 'Occupied');
  assert.equal(view.sublabel, undefined);
});

test('finite checkout still shows Available soon', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: false,
    nextAvailableDate: '2027-08-01',
    vacatingDate: null,
    vacatingStatus: null,
    reservedFrom: null,
  });
  assert.equal(view.kind, 'pre_bookable');
  assert.equal(view.label, 'Available soon');
  assert.match(view.sublabel ?? '', /Aug 2027/);
});

test('notice period still wins over open-ended stay end', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: false,
    nextAvailableDate: '2099-01-01',
    vacatingDate: '2026-06-26',
    vacatingStatus: 'pending',
    reservedFrom: null,
  });
  assert.equal(view.kind, 'notice');
  assert.equal(view.label, 'Notice period');
});

test('manual occupied shows Occupied on admin and customer maps', () => {
  const admin = deriveBedAvailabilityView({
    bedStatus: 'available',
    manualOccupied: true,
    isOccupiedToday: false,
    isAvailableNow: false,
  });
  assert.equal(admin.kind, 'occupied');
  assert.equal(admin.label, 'Occupied');
  assert.match(admin.sublabel ?? '', /not on website/);

  const customer = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    manualOccupied: true,
    isAvailableNow: false,
  });
  assert.equal(customer.kind, 'occupied');
  assert.equal(customer.label, 'Occupied');
});
