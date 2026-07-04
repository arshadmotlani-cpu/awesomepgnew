import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveBedAvailabilityView, deriveCustomerBedAvailabilityView } from '../../src/lib/bedAvailabilityState';

const PAST = '2026-06-18';
const TODAY = '2026-06-22';

test('approved vacating past due shows move-out overdue on customer picker', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: false,
    isOccupiedToday: true,
    vacatingDate: PAST,
    vacatingStatus: 'approved',
    reservedFrom: null,
  });
  assert.equal(view.kind, 'notice');
  assert.equal(view.label, 'Move-out overdue');
  assert.match(view.sublabel ?? '', /Move-out was/i);
  assert.doesNotMatch(view.sublabel ?? '', /checkout pending/i);
});

test('pending vacating past due prompts admin review on customer picker', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: false,
    isOccupiedToday: true,
    vacatingDate: PAST,
    vacatingStatus: 'pending',
    reservedFrom: null,
  });
  assert.equal(view.label, 'Move-out overdue');
  assert.match(view.sublabel ?? '', /admin review/i);
});

test('future approved vacating still shows notice period', () => {
  const view = deriveCustomerBedAvailabilityView({
    bedStatus: 'available',
    isAvailableNow: false,
    isOccupiedToday: true,
    vacatingDate: '2099-07-01',
    vacatingStatus: 'approved',
    reservedFrom: null,
  });
  assert.equal(view.label, 'Notice period');
  assert.match(view.sublabel ?? '', /Available from/i);
});

test('admin map shows overdue notice for approved past-due stay', () => {
  const view = deriveBedAvailabilityView({
    bedStatus: 'available',
    isOccupiedToday: true,
    vacatingDate: PAST,
    vacatingStatus: 'approved',
    occupantFirstName: 'Priya',
  });
  assert.equal(view.kind, 'notice');
  assert.equal(view.label, 'Priya');
  assert.equal(view.sublabel, 'Move-out overdue');
  assert.doesNotMatch(view.sublabel ?? '', /settlement/i);
});

test('vacating past due title copy uses days overdue', () => {
  const daysRemaining = Math.floor(
    (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${PAST}T00:00:00Z`)) / 86_400_000,
  );
  assert.equal(daysRemaining, 4);
  const title = `Resident · Move-out overdue (${Math.abs(daysRemaining)}d) · complete checkout`;
  assert.match(title, /4d/);
});
