import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResidentBriefingMessage } from '../../src/lib/cockroach/residentBriefing';

const BASE = {
  residentName: 'Arshad Motlani',
  pgName: 'Shanti Nagar PG',
  bookingCode: 'AWPG-2026-0042',
  bookingId: '550e8400-e29b-41d4-a716-446655440000',
  roomLabel: 'Room 204',
  bedLabel: 'Bed 2',
  checkInDate: '2026-06-01',
  checkoutLabel: 'Open-ended (living here)',
  statusLabel: 'Confirmed',
  paymentLabel: 'Paid',
  monthlyRentLabel: '₹6,000',
  kycLabel: 'Verified',
  isActiveResident: true,
};

test('buildResidentBriefingMessage greets resident and covers booking, PS4, vacating', () => {
  const text = buildResidentBriefingMessage(BASE);
  assert.match(text, /Arshad Motlani/);
  assert.match(text, /Shanti Nagar PG/);
  assert.match(text, /AWPG-2026-0042/);
  assert.match(text, /PS4/);
  assert.match(text, /₹350/);
  assert.match(text, /vacating date/i);
  assert.match(text, /14 days notice/);
  assert.match(text, /request-vacating/);
});

test('buildResidentBriefingMessage reflects active PS4 membership', () => {
  const text = buildResidentBriefingMessage({
    ...BASE,
    ps4Active: true,
    ps4PlanLabel: 'Monthly',
  });
  assert.match(text, /already on the PS4 add-on/);
  assert.doesNotMatch(text, /Subscribe to PS4/);
});

test('buildResidentBriefingMessage reflects submitted vacating', () => {
  const text = buildResidentBriefingMessage({
    ...BASE,
    vacatingDate: '2026-07-15',
    vacatingStatus: 'pending',
  });
  assert.match(text, /submitted vacating for 2026-07-15/);
  assert.match(text, /Withdraw vacating request/);
  assert.doesNotMatch(text, /Choose your vacating date/);
});

test('buildResidentBriefingMessage omits resident extras for non-residents', () => {
  const text = buildResidentBriefingMessage({
    ...BASE,
    isActiveResident: false,
  });
  assert.match(text, /NEXT STEPS/);
  assert.doesNotMatch(text, /ADD PS4 GAMING/);
});
