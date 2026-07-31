import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildElectricityPaymentBreakdown } from '@/src/lib/billing/buildElectricityPaymentBreakdown';
import { buildElectricityRunningBalanceTimeline } from '@/src/lib/billing/buildElectricityRunningBalanceTimeline';
import {
  buildElectricityLifetimeSummary,
  buildRoomElectricityOperatorView,
} from '@/src/lib/billing/buildRoomElectricityOperatorView';
import type { RoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';

function sampleAudit(): RoomElectricityAuditView {
  return {
    roomSummary: {
      roomNumber: '203',
      pgName: 'Shanti Nagar',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-07-01',
      meterStartUnits: 1250,
      meterEndUnits: 1380,
      unitsConsumed: 130,
      ratePerUnitPaise: 1600,
      grossTotalPaise: 208_000,
      residentCount: 1,
      generatedAt: '2026-06-30T12:00:00.000Z',
      collectionStatus: 'none',
      collectedPaise: 0,
      outstandingPaise: 84_000,
      collectionPercentage: 0,
    },
    roomNumber: '203',
    billingMonth: '2026-06-01',
    grossTotalPaise: 208_000,
    prepaidCreditPaise: 0,
    checkoutCreditsPaise: 0,
    manualCreditsPaise: 0,
    splittablePaise: 166_000,
    roundingRemainderPaise: 0,
    residentRows: [
      {
        invoiceId: 'inv1',
        invoiceNumber: 'ELE-2026-06-0001',
        bookingId: 'b1',
        customerId: 'c1',
        customerName: 'Rahul',
        bedCode: 'A1',
        checkIn: '2026-06-01',
        checkOut: null,
        daysCharged: 30,
        billingCycleDays: 30,
        occupancyPct: 100,
        unitsAllocated: 65,
        amountAllocatedPaise: 84_000,
        previousOutstandingPaise: 0,
        previousCollectedPaise: 0,
        currentPaidPaise: 0,
        currentOutstandingPaise: 84_000,
        amountPaidPaise: 0,
        status: 'pending',
        paymentStatus: 'pending',
        role: 'active',
        excludedBecauseCheckoutPaid: false,
        financialInvoiceId: 'fin1',
        timeline: [],
      },
    ],
    sumAllocatedPaise: 84_000,
    sumCreditsPaise: 0,
    reconciliationGapPaise: 0,
    isBalanced: true,
    collectedPaise: 0,
    outstandingPaise: 84_000,
    collectionPercentage: 0,
  };
}

const mayInvoice = {
  id: 'inv0',
  invoiceNumber: 'ELE-2026-05-0001',
  electricityBillId: 'bill0',
  billingMonth: '2026-05-01',
  amountPaise: 72_000,
  paidPaise: 72_000,
  status: 'paid',
  effectiveStatus: 'paid',
  outstandingPaise: 0,
  paidAt: '2026-05-15T00:00:00.000Z',
  dueDate: '2026-05-04',
  roomNumber: '203',
  firstViewedAt: '2026-05-10T00:00:00.000Z',
  viewedSource: 'pay_page',
  createdAt: '2026-05-01T00:00:00.000Z',
  financialInvoiceId: null,
};

const juneInvoice = {
  id: 'inv1',
  invoiceNumber: 'ELE-2026-06-0001',
  electricityBillId: 'bill1',
  billingMonth: '2026-06-01',
  amountPaise: 84_000,
  paidPaise: 0,
  status: 'pending',
  effectiveStatus: 'pending',
  outstandingPaise: 84_000,
  paidAt: null,
  dueDate: '2026-07-03',
  roomNumber: '203',
  firstViewedAt: null,
  viewedSource: null,
  createdAt: '2026-06-30T12:00:00.000Z',
  financialInvoiceId: 'fin1',
};

describe('buildRoomElectricityOperatorView', () => {
  it('maps audit rows to operator resident cards with history', () => {
    const view = buildRoomElectricityOperatorView({
      audit: sampleAudit(),
      invoiceHistoryByBookingId: new Map([['b1', [juneInvoice]]]),
      paymentHistoryByBookingId: new Map([['b1', []]]),
    });

    assert.equal(view.residents.length, 1);
    assert.equal(view.residents[0]!.lifetimeSummary.totalBilledPaise, 84_000);
    assert.equal(view.residents[0]!.runningBalanceTimeline.length, 1);
  });

  it('buildElectricityLifetimeSummary aggregates multi-month history with breakdown', () => {
    const invoiceHistory = [mayInvoice, juneInvoice];
    const paymentHistory = [
      {
        id: 'pay1',
        customerId: 'c1',
        customerName: 'Rahul',
        bookingId: 'b1',
        date: '2026-05-15',
        amountPaise: 72_000,
        invoiceNumber: 'ELE-2026-05-0001',
        electricityInvoiceId: 'inv0',
        financialInvoiceId: null,
        collectedBy: 'Admin',
        paymentMode: 'UPI',
        source: 'monthly_invoice',
        outstandingAfterPaise: 0,
        billingMonth: '2026-05-01',
      },
      {
        id: 'credit1',
        customerId: 'c1',
        customerName: 'Rahul',
        bookingId: 'b1',
        date: '2026-04-20',
        amountPaise: 10_000,
        invoiceNumber: null,
        electricityInvoiceId: null,
        financialInvoiceId: null,
        collectedBy: 'Admin',
        paymentMode: 'Historical offline',
        source: 'historical',
        outstandingAfterPaise: null,
        billingMonth: '2026-04-01',
      },
    ];

    const summary = buildElectricityLifetimeSummary({
      invoiceHistory,
      paymentHistory,
      previousOutstandingCarriedForwardPaise: 12_000,
      currentMonthOutstandingPaise: 84_000,
    });

    assert.equal(summary.totalBilledPaise, 156_000);
    assert.equal(summary.totalPaidPaise, 82_000);
    assert.equal(summary.paymentBreakdown.length, 2);
    assert.equal(
      summary.paymentBreakdown.find((l) => l.key === 'monthly_invoice')!.amountPaise,
      72_000,
    );
    assert.equal(
      summary.paymentBreakdown.find((l) => l.key === 'historical')!.amountPaise,
      10_000,
    );
  });

  it('buildElectricityPaymentBreakdown never collapses to a single line when multiple sources exist', () => {
    const lines = buildElectricityPaymentBreakdown({
      invoiceHistory: [mayInvoice],
      paymentHistory: [
        {
          id: 'pay1',
          customerId: 'c1',
          customerName: 'Rahul',
          bookingId: 'b1',
          date: '2026-05-15',
          amountPaise: 72_000,
          invoiceNumber: 'ELE-2026-05-0001',
          electricityInvoiceId: 'inv0',
          financialInvoiceId: null,
          collectedBy: 'Admin',
          paymentMode: 'UPI',
          source: 'monthly_invoice',
          outstandingAfterPaise: 0,
          billingMonth: '2026-05-01',
        },
        {
          id: 'settle1',
          customerId: 'c1',
          customerName: 'Rahul',
          bookingId: 'b1',
          date: '2026-04-01',
          amountPaise: 15_000,
          invoiceNumber: null,
          electricityInvoiceId: null,
          financialInvoiceId: null,
          collectedBy: 'Checkout settlement',
          paymentMode: 'Checkout',
          source: 'checkout_settlement',
          outstandingAfterPaise: null,
          billingMonth: '2026-04-01',
        },
      ],
    });

    assert.equal(lines.length, 2);
    assert.ok(lines.some((l) => l.key === 'monthly_invoice'));
    assert.ok(lines.some((l) => l.key === 'checkout_settlement'));
  });

  it('buildElectricityRunningBalanceTimeline tracks balance after each event', () => {
    const timeline = buildElectricityRunningBalanceTimeline({
      invoiceHistory: [mayInvoice, juneInvoice],
      paymentHistory: [
        {
          id: 'pay1',
          customerId: 'c1',
          customerName: 'Rahul',
          bookingId: 'b1',
          date: '2026-05-15',
          amountPaise: 72_000,
          invoiceNumber: 'ELE-2026-05-0001',
          electricityInvoiceId: 'inv0',
          financialInvoiceId: null,
          collectedBy: 'Admin',
          paymentMode: 'UPI',
          source: 'monthly_invoice',
          outstandingAfterPaise: 0,
          billingMonth: '2026-05-01',
        },
      ],
    });

    assert.equal(timeline.length, 3);
    assert.equal(timeline[0]!.kind, 'bill_generated');
    assert.equal(timeline[0]!.outstandingAfterPaise, 72_000);
    assert.equal(timeline[1]!.deltaPaise, -72_000);
    assert.equal(timeline[1]!.outstandingAfterPaise, 0);
    assert.equal(timeline[2]!.outstandingAfterPaise, 84_000);
    assert.equal(timeline[2]!.electricityBillId, 'bill1');
  });
});
