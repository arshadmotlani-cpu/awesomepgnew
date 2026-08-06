/**
 * Resident Exit Brain — activation, freeze, and refund estimate tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectInvoice } from '@/src/services/rentInvoices';
import {
  buildExitRefundEstimate,
  mapElectricityInvoiceStatus,
} from '@/src/lib/exit/exitBrainRefundEstimatePure';

describe('exitBrainRefundEstimatePure', () => {
  it('builds full refund estimate with frozen penalties and dual electricity', () => {
    const estimate = buildExitRefundEstimate({
      depositHeldPaise: 450_000,
      pendingRentPrincipalPaise: 412_000,
      frozenRentLateFeePaise: 8_200,
      frozenNoticePenaltyPaise: 132_000,
      electricityGenerated: {
        amountPaise: 67_016,
        outstandingPaise: 67_016,
        status: 'Pending',
        billingMonth: '2026-07-01',
      },
      electricityEstimated: {
        amountPaise: null,
        residentSharePaise: 31_800,
        pending: true,
        label: 'Estimated from checkout meter reading',
      },
    });

    assert.equal(estimate.depositHeldPaise, 450_000);
    assert.ok(estimate.lines.some((l) => l.key === 'pending_electricity_invoice'));
    assert.ok(estimate.lines.some((l) => l.key === 'estimated_checkout_electricity'));
    assert.ok(estimate.lines.some((l) => l.key === 'frozen_late_fee'));
    assert.ok(estimate.lines.some((l) => l.key === 'notice_penalty'));
    assert.equal(estimate.estimatedRefundPaise, 450_000 - 412_000 - 8_200 - 132_000 - 67_016 - 31_800);
  });

  it('maps deposit-recovered electricity status', () => {
    assert.equal(
      mapElectricityInvoiceStatus({
        outstandingPaise: 0,
        paidPaise: 32_533,
        deductedFromDepositPaise: 32_533,
      }),
      'Recovered from Deposit',
    );
  });

  it('shows positive refund when dues are low', () => {
    const estimate = buildExitRefundEstimate({
      depositHeldPaise: 450_000,
      pendingRentPrincipalPaise: 0,
      frozenRentLateFeePaise: 0,
      frozenNoticePenaltyPaise: 132_000,
      electricityGenerated: null,
      electricityEstimated: {
        amountPaise: null,
        residentSharePaise: null,
        pending: false,
        label: 'None',
      },
    });
    assert.equal(estimate.estimatedRefundPaise, 318_000);
  });
});

describe('exit mode rent late fee freeze', () => {
  it('projectInvoice uses frozen late fee when exit mode cap is set', () => {
    const projected = projectInvoice(
      {
        id: 'inv-1',
        invoiceNumber: 'RENT-TEST',
        bookingId: 'booking-1',
        customerId: 'cust-1',
        bedId: 'bed-1',
        pgId: 'pg-1',
        billingMonth: '2026-07-01',
        dueDate: '2026-07-05',
        rentPaise: 412_000,
        discountPaise: 0,
        paidPrincipalPaise: 0,
        paidLateFeePaise: 0,
        lateFeeLockedPaise: null,
        status: 'overdue',
        paymentId: null,
        paidAt: null,
        paymentProofUrl: null,
        isAdhoc: false,
        promoCode: null,
        proofSubmittedAt: null,
        proofSnapshotOutstandingPaise: null,
        proofSnapshotLateFeePaise: null,
        proofSnapshotPrincipalDuePaise: null,
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-01'),
      },
      '2026-08-20',
      { exitModeFrozenLateFeePaise: 8_200 },
    );
    assert.equal(projected.accruedLateFeePaise, 8_200);
  });
});

describe('initializeRoomBrainStack', () => {
  it('exports brain stack initializer', async () => {
    const mod = await import('@/src/lib/brains/initializeRoomBrainStack');
    assert.equal(typeof mod.initializeRoomBrainStack, 'function');
  });
});

describe('exit brain public API', () => {
  it('exports load and activate functions', async () => {
    const mod = await import('@/src/lib/exit/index');
    assert.equal(typeof mod.loadResidentExitBrainSnapshot, 'function');
    assert.equal(typeof mod.activateResidentExitBrain, 'function');
    assert.equal(typeof mod.buildExitRefundEstimate, 'function');
  });
});
