/**
 * Exit Brain state machine — lifecycle states and capability flags.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildExitBrainLifecycle,
  deriveExitBrainCapabilities,
  resolveExitBrainLifecycleState,
} from '@/src/lib/exit/exitBrainStateMachine';

const baseInput = {
  hasMeterPhoto: false,
  meterPhotoMissing: false,
  electricitySharePaise: null,
  electricityEstimatedPending: true,
  refundPaidAt: null,
  hasPayoutDetails: false,
  hasSettlement: false,
};

describe('exitBrainStateMachine', () => {
  it('progresses from notice submitted to exit active', () => {
    assert.equal(
      resolveExitBrainLifecycleState({
        ...baseInput,
        vacatingStatus: 'pending',
        exitBrainStatus: null,
        settlementStatus: null,
      }),
      'notice_submitted',
    );

    assert.equal(
      resolveExitBrainLifecycleState({
        ...baseInput,
        vacatingStatus: 'approved',
        exitBrainStatus: 'active',
        settlementStatus: null,
        hasSettlement: false,
      }),
      'exit_active',
    );
  });

  it('enters checkout pending when settlement is in progress', () => {
    assert.equal(
      resolveExitBrainLifecycleState({
        ...baseInput,
        vacatingStatus: 'approved',
        exitBrainStatus: 'active',
        settlementStatus: 'awaiting_admin_review',
        hasSettlement: true,
        hasMeterPhoto: true,
        electricityEstimatedPending: false,
        electricitySharePaise: 50_000,
      }),
      'checkout_pending',
    );
  });

  it('blocks bed move during exit active', () => {
    const lifecycle = buildExitBrainLifecycle({
      ...baseInput,
      vacatingStatus: 'approved',
      exitBrainStatus: 'active',
      settlementStatus: null,
    });

    assert.equal(lifecycle.state, 'exit_active');
    assert.equal(lifecycle.capabilities.canMoveBed.allowed, false);
    assert.equal(lifecycle.capabilities.canTransferRoom.allowed, false);
    assert.equal(lifecycle.capabilities.canMergeResidency.allowed, false);
    assert.equal(lifecycle.isExitMode, true);
  });

  it('allows inventory ops when inactive', () => {
    const caps = deriveExitBrainCapabilities('inactive', {
      ...baseInput,
      vacatingStatus: null,
      exitBrainStatus: null,
      settlementStatus: null,
    });

    assert.equal(caps.canMoveBed.allowed, true);
    assert.equal(caps.canTransferRoom.allowed, true);
    assert.equal(caps.canMergeResidency.allowed, true);
  });

  it('allows refund request when eligible in exit active', () => {
    const lifecycle = buildExitBrainLifecycle({
      ...baseInput,
      vacatingStatus: 'approved',
      exitBrainStatus: 'active',
      settlementStatus: null,
      refundRequestEligible: true,
    });

    assert.equal(lifecycle.capabilities.canRequestRefund.allowed, true);
  });

  it('resolves refund pending and completed states', () => {
    assert.equal(
      resolveExitBrainLifecycleState({
        ...baseInput,
        vacatingStatus: 'approved',
        exitBrainStatus: 'active',
        settlementStatus: 'refund_pending',
        hasSettlement: true,
      }),
      'refund_pending',
    );

    assert.equal(
      resolveExitBrainLifecycleState({
        ...baseInput,
        vacatingStatus: 'completed',
        exitBrainStatus: 'completed',
        settlementStatus: 'refund_paid',
        hasSettlement: true,
        refundPaidAt: '2026-08-13',
      }),
      'refund_completed',
    );
  });
});
