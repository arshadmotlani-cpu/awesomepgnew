/**
 * Exit Brain projections — phase, timeline, checklist, confidence.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveExitBrainPhase } from '@/src/lib/exit/exitBrainPhase';
import { buildExitBrainTimeline } from '@/src/lib/exit/exitBrainTimeline';
import { buildExitBrainChecklist } from '@/src/lib/exit/exitBrainChecklist';
import { computeExitRefundConfidence } from '@/src/lib/exit/exitBrainRefundConfidence';
import { adminRoleCanOverrideExitLock } from '@/src/lib/exit/exitBrainGuards';

describe('exitBrainPhase', () => {
  it('resolves notice submitted for pending vacating', () => {
    assert.equal(
      resolveExitBrainPhase({
        vacatingStatus: 'pending',
        exitBrainStatus: null,
        settlementStatus: null,
        hasMeterPhoto: false,
        meterPhotoMissing: false,
        electricitySharePaise: null,
        electricityEstimatedPending: true,
        refundPaidAt: null,
        hasPayoutDetails: false,
      }),
      'notice_submitted',
    );
  });

  it('resolves waiting refund when settlement is refund_pending', () => {
    assert.equal(
      resolveExitBrainPhase({
        vacatingStatus: 'approved',
        exitBrainStatus: 'active',
        settlementStatus: 'refund_pending',
        hasMeterPhoto: true,
        meterPhotoMissing: false,
        electricitySharePaise: 31_800,
        electricityEstimatedPending: false,
        refundPaidAt: null,
        hasPayoutDetails: true,
      }),
      'waiting_refund',
    );
  });
});

describe('exitBrainTimeline', () => {
  it('orders events with frozen penalties after approval', () => {
    const timeline = buildExitBrainTimeline({
      vacatingStatus: 'approved',
      exitBrainStatus: 'active',
      settlementStatus: 'awaiting_admin_review',
      hasMeterPhoto: true,
      meterPhotoMissing: false,
      electricitySharePaise: 62_000,
      electricityEstimatedPending: false,
      refundPaidAt: null,
      hasPayoutDetails: true,
      noticeSubmittedAt: '2026-08-05',
      noticeApprovedAt: '2026-08-06',
      exitActivatedAt: '2026-08-06T10:00:00.000Z',
      settlementCreatedAt: '2026-08-10',
      settlementUpdatedAt: '2026-08-10',
      settlementApprovedAt: null,
      refundPaidAt: null,
    });

    assert.equal(timeline[0]?.id, 'notice_submitted');
    assert.equal(timeline[0]?.status, 'done');
    assert.equal(timeline[2]?.id, 'penalties_frozen');
    assert.equal(timeline[2]?.status, 'done');
    assert.equal(timeline[3]?.id, 'meter_uploaded');
    assert.equal(timeline[3]?.status, 'done');
  });
});

describe('exitBrainChecklist', () => {
  it('marks meter upload pending before photo', () => {
    const checklist = buildExitBrainChecklist({
      vacatingStatus: 'approved',
      settlementStatus: 'awaiting_resident_details',
      hasMeterPhoto: false,
      meterPhotoMissing: true,
      electricitySharePaise: null,
      electricityEstimatedPending: true,
      refundPaidAt: null,
      hasPayoutDetails: false,
    });

    const meter = checklist.find((c) => c.id === 'upload_meter_photo');
    assert.equal(meter?.status, 'pending');
  });
});

describe('exitBrainRefundConfidence', () => {
  it('penalizes pending meter and estimate', () => {
    const result = computeExitRefundConfidence({
      hasMeterPhoto: false,
      meterPhotoMissing: true,
      electricityEstimatedPending: true,
      electricitySharePaise: null,
      settlementStatus: 'awaiting_resident_details',
      hasPayoutDetails: false,
      pendingRentPrincipalPaise: 0,
      outstandingElectricityPaise: 0,
    });

    assert.ok(result.confidencePercent < 100);
    assert.ok(result.reasons.some((r) => r.includes('meter')));
  });
});

describe('exitBrainGuards', () => {
  it('allows owner override for super_admin', () => {
    assert.equal(adminRoleCanOverrideExitLock('super_admin'), true);
    assert.equal(adminRoleCanOverrideExitLock('pg_manager'), false);
  });
});

describe('exitBrainLifecycleUi', () => {
  it('derives move-out complete from lifecycle state', async () => {
    const { isMoveOutLifecycleComplete, resolveExitLifecycleFromSnapshot } = await import(
      '@/src/lib/exit/exitBrainLifecycleUi'
    );
    const lifecycle = resolveExitLifecycleFromSnapshot({
      apiVersion: 'exit-brain/v1',
      bookingId: 'b1',
      status: 'completed',
      phase: 'completed',
      lifecycle: {
        state: 'archived',
        stateLabel: 'Archived',
        capabilities: {} as never,
        penaltiesFrozen: false,
        isExitMode: false,
      },
      isExitMode: false,
      activatedAt: null,
      noticeGivenDate: null,
      expectedCheckoutDate: null,
      timeline: [],
      checklist: [],
      frozen: { noticePenaltyPaise: 0, rentLateFeePaise: 0 },
      outstanding: {
        rentPrincipalPaise: 0,
        rentLateFeePaise: 0,
        electricityInvoicePaise: 0,
        penaltiesPaise: 0,
        miscPaise: 0,
      },
      electricity: {
        generatedInvoice: null,
        estimatedCheckout: {
          amountPaise: null,
          residentSharePaise: null,
          pending: false,
          label: 'None',
        },
      },
      refundEstimate: {
        lines: [],
        estimatedRefundPaise: 0,
        depositHeldPaise: 0,
        disclaimer: '',
        confidencePercent: 100,
        confidenceReasons: [],
      },
      autoRecoverFromDeposit: false,
    });
    assert.equal(isMoveOutLifecycleComplete(lifecycle), true);
  });
});

describe('exit brain public exports', () => {
  it('exports lifecycle and state machine APIs', async () => {
    const mod = await import('@/src/lib/exit/index');
    assert.equal(typeof mod.loadExitBrainLifecycleForBooking, 'function');
    assert.equal(typeof mod.resolveExitLifecycleFromSnapshot, 'function');
    assert.equal(typeof mod.assertExitCapabilityAllowed, 'function');
  });
});
