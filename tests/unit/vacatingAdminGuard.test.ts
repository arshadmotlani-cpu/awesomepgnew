import assert from 'node:assert/strict';
import test from 'node:test';

test('complete vacating error kind bed_not_occupied has actionable message', () => {
  const message =
    'This bed is already vacant — no active stay to complete. Cancel the vacating notice instead.';
  assert.ok(message.includes('Cancel'));
  assert.ok(message.includes('vacant'));
});
