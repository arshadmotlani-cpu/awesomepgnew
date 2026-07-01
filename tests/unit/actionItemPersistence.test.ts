import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTION_ITEM_GROUP_LABELS, ACTION_ITEM_GROUP_ORDER } from '../../src/lib/actionCenter/constants';
import { UNRESOLVED_ACTION_BADGE_BUCKET } from '../../src/services/unresolvedActions';

test('action item group order includes fixed stay checkout and refund submitted', () => {
  assert.ok(ACTION_ITEM_GROUP_ORDER.includes('fixed_stay_checkout_due'));
  assert.ok(ACTION_ITEM_GROUP_ORDER.includes('refund_request_submitted'));
  assert.ok(ACTION_ITEM_GROUP_LABELS.fixed_stay_checkout_due);
});

test('admin nav badges map unresolved action types to sidebar buckets', () => {
  assert.equal(UNRESOLVED_ACTION_BADGE_BUCKET.checkout_settlement, 'checkout');
  assert.equal(UNRESOLVED_ACTION_BADGE_BUCKET.deposit_refund_approval, 'operations');
});

test('mark resolved is an explicit action not auto on view', async () => {
  const { ACTION_EXECUTION_TYPES } = await import('../../src/lib/actionCenter/constants');
  assert.ok(ACTION_EXECUTION_TYPES.includes('mark_resolved'));
  assert.equal(ACTION_EXECUTION_TYPES.includes('auto_resolve_on_view' as never), false);
});
