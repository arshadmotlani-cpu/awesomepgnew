import { strict as assert } from 'node:assert';
import test from 'node:test';
import { buildCheckoutNotificationPushContent } from '../../src/lib/notifications/checkoutNotificationContent';

test('buildCheckoutNotificationPushContent formats pending move-out with full context', () => {
  const result = buildCheckoutNotificationPushContent(
    'vacating_alert',
    {
      residentName: 'Mohd Aatif Siddiqui',
      pgName: 'SHANTINAGAR - AWESOME PG',
      roomNumber: '204',
      bedCode: 'B2',
    },
    '2026-06-30',
    'Mohd Aatif Siddiqui · Approve move-out notice · 2026-06-30',
  );

  assert.equal(result.title, 'Move-out Request');
  assert.match(result.body, /Mohd Aatif Siddiqui/);
  assert.match(result.body, /SHANTINAGAR - AWESOME PG/);
  assert.match(result.body, /Room 204 • Bed B2/);
  assert.match(result.body, /Move-out request awaiting approval/);
});

test('buildCheckoutNotificationPushContent includes requested move-out date when approved', () => {
  const result = buildCheckoutNotificationPushContent(
    'vacating_alert',
    {
      residentName: 'Waqar Ahmad',
      roomNumber: '203',
      bedCode: 'B3',
    },
    '2026-07-15',
    'Waqar Ahmad · Vacating 2026-07-15',
  );

  assert.match(result.body, /Waqar Ahmad/);
  assert.match(result.body, /Room 203 • Bed B3/);
  assert.match(result.body, /Requested move-out on 15 July 2026/);
});

test('buildCheckoutNotificationPushContent formats fixed stay checkout', () => {
  const result = buildCheckoutNotificationPushContent(
    'fixed_stay_checkout_due',
    {
      residentName: 'Test Resident',
      pgName: 'IT PARK',
      roomNumber: '101',
      bedCode: 'A1',
    },
    '2026-08-01',
    'Test Resident · Fixed stay checkout · BK-001',
  );

  assert.equal(result.title, 'Checkout Due');
  assert.match(result.body, /Fixed stay checkout on 1 August 2026/);
});

test('buildCheckoutNotificationPushContent formats deposit refund pending', () => {
  const result = buildCheckoutNotificationPushContent(
    'refund_pending',
    {
      residentName: 'Jane Doe',
      pgName: 'CENTRAL AVENUE',
      roomNumber: '12',
      bedCode: 'C4',
    },
    null,
    'Jane Doe · Deposit refund pending',
  );

  assert.equal(result.title, 'Deposit Refund Pending');
  assert.match(result.body, /Deposit refund pending/);
});
