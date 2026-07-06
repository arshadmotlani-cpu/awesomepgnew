import test from 'node:test';
import assert from 'node:assert/strict';
import { transferModeLabel } from '@/src/lib/roomTransfer/transferAvailability';

test('transferModeLabel maps immediate and scheduled', () => {
  assert.equal(transferModeLabel('immediate'), 'Immediate');
  assert.equal(transferModeLabel('scheduled'), 'Scheduled');
});
