import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildElectricityResidentTimeline } from '@/src/lib/billing/buildElectricityResidentTimeline';

describe('buildElectricityResidentTimeline', () => {
  it('orders check-in, bill, credit, and remaining due', () => {
    const events = buildElectricityResidentTimeline({
      bookingId: 'b1',
      checkIn: '2026-06-01',
      billGeneratedAt: '2026-06-30T12:00:00.000Z',
      invoiceId: 'inv1',
      financialInvoiceId: 'fin1',
      creditAppliedPaise: 0,
      amountAllocatedPaise: 84_000,
      amountPaidPaise: 0,
      currentOutstandingPaise: 84_000,
      paidAt: null,
      invoiceStatus: 'pending',
    });

    assert.equal(events[0]!.kind, 'check_in');
    assert.equal(events[1]!.kind, 'bill_generated');
    assert.equal(events.at(-1)!.kind, 'remaining_due');
    assert.equal(events[1]!.amountPaise, 84_000);
  });

  it('shows checkout credit and final payment when fully paid', () => {
    const events = buildElectricityResidentTimeline({
      bookingId: 'b2',
      checkIn: '2026-06-01',
      billGeneratedAt: '2026-06-30T12:00:00.000Z',
      invoiceId: null,
      financialInvoiceId: null,
      creditAppliedPaise: 42_000,
      amountAllocatedPaise: 0,
      amountPaidPaise: 42_000,
      currentOutstandingPaise: 0,
      paidAt: '2026-06-15',
      invoiceStatus: 'paid',
    });

    assert.ok(events.some((e) => e.kind === 'checkout_credit'));
    assert.ok(events.some((e) => e.kind === 'final_payment'));
    assert.equal(events.filter((e) => e.kind === 'remaining_due').length, 0);
  });

  it('shows partial payment when not fully paid', () => {
    const events = buildElectricityResidentTimeline({
      bookingId: 'b3',
      checkIn: '2026-06-01',
      billGeneratedAt: '2026-06-30T12:00:00.000Z',
      invoiceId: 'inv3',
      financialInvoiceId: null,
      creditAppliedPaise: 0,
      amountAllocatedPaise: 84_000,
      amountPaidPaise: 40_000,
      currentOutstandingPaise: 44_000,
      paidAt: '2026-07-02',
      invoiceStatus: 'partial',
    });

    assert.ok(events.some((e) => e.kind === 'partial_payment'));
    assert.ok(events.some((e) => e.kind === 'remaining_due'));
  });
});
