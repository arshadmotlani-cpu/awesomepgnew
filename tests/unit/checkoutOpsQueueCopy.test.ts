import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  deriveCheckoutOpsNextAction,
  isTerminalCheckoutSettlement,
} from '../../src/lib/residents/checkoutOpsQueueCopy';

describe('checkoutOpsQueueCopy', () => {
  test('pending vacating asks for notice approval', () => {
    const copy = deriveCheckoutOpsNextAction({
      vacatingStatus: 'pending',
      settlementStatus: null,
      finalRefundPaise: null,
    });
    assert.match(copy.nextAction, /Review move-out notice/);
    assert.equal(copy.primaryActionLabel, 'Review move-out');
  });

  test('awaiting resident details shows specific blocker', () => {
    const copy = deriveCheckoutOpsNextAction({
      vacatingStatus: 'approved',
      settlementStatus: 'awaiting_resident_details',
      finalRefundPaise: 0,
    });
    assert.match(copy.nextAction, /meter photo/);
  });

  test('zero refund checkout shows complete checkout not generic settlement', () => {
    const copy = deriveCheckoutOpsNextAction({
      vacatingStatus: 'approved',
      settlementStatus: 'awaiting_admin_review',
      finalRefundPaise: 0,
    });
    assert.match(copy.nextAction, /Review electricity/);
  });

  test('terminal settlement detection', () => {
    assert.equal(isTerminalCheckoutSettlement('completed'), true);
    assert.equal(isTerminalCheckoutSettlement('refund_paid'), true);
    assert.equal(isTerminalCheckoutSettlement('awaiting_admin_review'), false);
  });
});
