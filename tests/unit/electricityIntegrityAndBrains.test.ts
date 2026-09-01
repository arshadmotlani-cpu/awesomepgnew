/**
 * Electricity invoice integrity — deadline-only billing (no late-fee accrual on open invoices).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';

describe('electricity billing — no late-fee accrual', () => {
  it('projectElectricityInvoice skips late fee when lateFeeWaived is true', () => {
    const projected = projectElectricityInvoice(
      {
        id: 'inv-1',
        invoiceNumber: 'ELE-TEST',
        electricityBillId: 'bill-1',
        roomId: 'room-1',
        bookingId: 'booking-1',
        customerId: 'cust-1',
        bedId: 'bed-1',
        billingMonth: '2026-07-01',
        dueDate: '2026-07-05',
        amountPaise: 67_016,
        paidPaise: 0,
        lateFeeLockedPaise: null,
        lateFeeWaived: true,
        status: 'pending',
        paymentId: null,
        paidAt: null,
        paymentProofUrl: null,
        unitsShare: '96',
        activeDays: 31,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: new Date('2026-07-31'),
        updatedAt: new Date('2026-07-31'),
      },
      '2026-08-10',
    );
    assert.equal(projected.accruedLateFeePaise, 0);
    assert.equal(projected.effectiveStatus, 'overdue');
    assert.equal(projected.outstandingPaise, 67_016);
  });

  it('projectElectricityInvoice accrues zero late fee even when overdue and not waived', () => {
    const projected = projectElectricityInvoice(
      {
        id: 'inv-2',
        invoiceNumber: 'ELE-TEST-2',
        electricityBillId: 'bill-1',
        roomId: 'room-1',
        bookingId: 'booking-1',
        customerId: 'cust-1',
        bedId: 'bed-1',
        billingMonth: '2026-07-01',
        dueDate: '2026-07-05',
        amountPaise: 67_016,
        paidPaise: 0,
        lateFeeLockedPaise: null,
        lateFeeWaived: false,
        status: 'pending',
        paymentId: null,
        paidAt: null,
        paymentProofUrl: null,
        unitsShare: '96',
        activeDays: 31,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: new Date('2026-07-31'),
        updatedAt: new Date('2026-07-31'),
      },
      '2026-08-10',
    );
    assert.equal(projected.accruedLateFeePaise, 0);
    assert.equal(projected.effectiveStatus, 'overdue');
    assert.equal(projected.outstandingPaise, 67_016);
  });
});

describe('reopenElectricityInvoice module', () => {
  it('exports reopenElectricityInvoice', async () => {
    const mod = await import('@/src/services/electricityInvoiceIntegrity');
    assert.equal(typeof mod.reopenElectricityInvoice, 'function');
  });
});

describe('deposit checkout settlement brain', () => {
  it('exports buildDepositCheckoutSettlementBrain', async () => {
    const mod = await import('@/src/lib/deposits/depositCheckoutSettlementBrain');
    assert.equal(typeof mod.buildDepositCheckoutSettlementBrain, 'function');
  });
});

describe('room electricity settlement brain', () => {
  it('exports buildRoomElectricitySettlementSnapshot', async () => {
    const mod = await import('@/src/roomOs/engines/electricity/buildRoomElectricitySettlement');
    assert.equal(typeof mod.buildRoomElectricitySettlementSnapshot, 'function');
  });
});

describe('resident electricity account brain', () => {
  it('exports buildResidentElectricityAccount', async () => {
    const mod = await import('@/src/lib/residents/residentElectricityAccount');
    assert.equal(typeof mod.buildResidentElectricityAccount, 'function');
  });
});
