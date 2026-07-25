import assert from 'node:assert/strict';
import test from 'node:test';
import { OPS_QUEUE_LABELS } from '@/src/lib/operations/operationsFilterLinks';
import {
  OPS_PENDING_PAYOUTS_LABEL,
  PAYOUT_PENDING_STATUS,
  RECORD_PAYOUT_CTA,
  RESIDENT_PAYOUT_PROCESSING,
  RESIDENT_PAYOUT_COMPLETED,
} from '@/src/lib/payout/payoutDisplayTerminology';

test('ops refund_due chip label matches payout SSOT module', () => {
  assert.equal(OPS_QUEUE_LABELS.refund_due, OPS_PENDING_PAYOUTS_LABEL);
});

test('business labels use payout vocabulary not refund due', () => {
  assert.match(OPS_PENDING_PAYOUTS_LABEL.toLowerCase(), /payout/);
  assert.doesNotMatch(OPS_PENDING_PAYOUTS_LABEL.toLowerCase(), /refund due/);
  assert.match(PAYOUT_PENDING_STATUS.toLowerCase(), /payout/);
  assert.match(RECORD_PAYOUT_CTA.toLowerCase(), /record payout/);
  assert.match(RESIDENT_PAYOUT_PROCESSING, /payout is being processed/);
  assert.match(RESIDENT_PAYOUT_COMPLETED, /payout has been completed/);
});
