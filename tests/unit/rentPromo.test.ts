import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeRentDuePaise, projectInvoice } from '@/src/services/rentInvoices';

describe('computeRentDuePaise SSOT', () => {
  test('subtracts discount from gross rent', () => {
    assert.equal(computeRentDuePaise(900_000, 90_000), 810_000);
    assert.equal(computeRentDuePaise(900_000, 0), 900_000);
    assert.equal(computeRentDuePaise(900_000, null), 900_000);
    assert.equal(computeRentDuePaise(50_000, 100_000), 0);
  });
});

describe('rent invoice promo projection', () => {
  test('projectInvoice subtracts discount from outstanding rent', () => {
    const view = projectInvoice({
      id: 'inv-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      pgId: 'pg-1',
      bedId: 'bed-1',
      invoiceNumber: 'RI-1',
      billingMonth: '2026-07-01',
      dueDate: '2026-07-05',
      rentPaise: 900_000,
      discountPaise: 90_000,
      promoCode: '050726',
      status: 'pending',
      paidPrincipalPaise: 0,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: 0,
      paymentId: null,
      paidAt: null,
      paymentProofUrl: null,
      notes: null,
      cancelledAt: null,
      cancellationReason: null,
      isAdhoc: false,
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-07-01'),
    } as never);

    assert.equal(view.discountPaise, 90_000);
    assert.equal(view.promoCode, '050726');
    assert.ok(view.outstandingPaise <= 810_000 + 5000);
  });
});

describe('discount engine date coupon messages', () => {
  test('resolveCheckoutDiscount rejects empty code gracefully', async () => {
    const { resolveCheckoutDiscount } = await import('@/src/lib/billing/discountEngine');
    const result = await resolveCheckoutDiscount({
      kind: 'rent_invoice',
      amountPaise: 900_000,
      promoCode: '',
      customerId: '00000000-0000-0000-0000-000000000001',
    });
    assert.equal('discountPaise' in result ? result.discountPaise : -1, 0);
  });
});
