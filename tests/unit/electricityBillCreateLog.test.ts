import test from 'node:test';
import assert from 'node:assert/strict';
import { logElectricityBillCreate } from '@/src/lib/billing/electricityBillCreateLog';

test('logElectricityBillCreate emits structured JSON for success steps', () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg: string) => {
    lines.push(msg);
  };
  try {
    logElectricityBillCreate('bill_calculated', {
      requestId: 'test-1',
      unitsConsumed: 14,
      grossTotalPaise: 22_400,
    });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(parsed.scope, 'electricity_bill_create');
    assert.equal(parsed.step, 'bill_calculated');
    assert.equal(parsed.requestId, 'test-1');
    assert.equal(parsed.unitsConsumed, 14);
  } finally {
    console.log = original;
  }
});

test('logElectricityBillCreate uses console.error for failed step', () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (msg: string) => {
    errors.push(msg);
  };
  try {
    logElectricityBillCreate('failed', { requestId: 'test-2', message: 'db timeout' });
    assert.equal(errors.length, 1);
    const parsed = JSON.parse(errors[0]!) as Record<string, unknown>;
    assert.equal(parsed.step, 'failed');
    assert.equal(parsed.message, 'db timeout');
  } finally {
    console.error = original;
  }
});
