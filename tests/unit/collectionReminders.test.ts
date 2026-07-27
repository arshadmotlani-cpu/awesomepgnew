import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reminderMatchesAsOf,
  scheduledDateForReminder,
  renderReminderTemplate,
} from '../../src/services/collectionReminders';

test('reminderMatchesAsOf — billing_date offsets', () => {
  assert.equal(
    reminderMatchesAsOf({
      offsetDays: -7,
      anchor: 'billing_date',
      billingDate: '2026-07-01',
      dueDate: '2026-07-05',
      asOf: '2026-06-24',
    }),
    true,
  );
  assert.equal(
    reminderMatchesAsOf({
      offsetDays: 0,
      anchor: 'billing_date',
      billingDate: '2026-07-01',
      dueDate: '2026-07-05',
      asOf: '2026-07-01',
    }),
    true,
  );
  assert.equal(
    reminderMatchesAsOf({
      offsetDays: -3,
      anchor: 'billing_date',
      billingDate: '2026-07-01',
      dueDate: '2026-07-05',
      asOf: '2026-06-24',
    }),
    false,
  );
});

test('reminderMatchesAsOf — due_date offsets', () => {
  assert.equal(
    reminderMatchesAsOf({
      offsetDays: 0,
      anchor: 'due_date',
      billingDate: '2026-07-01',
      dueDate: '2026-07-15',
      asOf: '2026-07-15',
    }),
    true,
  );
  assert.equal(
    reminderMatchesAsOf({
      offsetDays: 3,
      anchor: 'due_date',
      billingDate: '2026-07-01',
      dueDate: '2026-07-15',
      asOf: '2026-07-18',
    }),
    true,
  );
  assert.equal(
    reminderMatchesAsOf({
      offsetDays: 7,
      anchor: 'due_date',
      billingDate: '2026-07-01',
      dueDate: '2026-07-15',
      asOf: '2026-07-20',
    }),
    false,
  );
});

test('scheduledDateForReminder', () => {
  assert.equal(
    scheduledDateForReminder({
      offsetDays: -1,
      anchor: 'billing_date',
      billingDate: '2026-07-01',
      dueDate: '2026-07-05',
    }),
    '2026-06-30',
  );
});

test('renderReminderTemplate interpolates variables', () => {
  const out = renderReminderTemplate('Hi {{name}}, pay {{amount}} by {{due_date}}', {
    name: 'Ada',
    amount: 'Rs. 6,000',
    due_date: '2026-07-15',
  });
  assert.equal(out, 'Hi Ada, pay Rs. 6,000 by 2026-07-15');
});
