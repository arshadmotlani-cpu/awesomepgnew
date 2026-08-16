import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rentRowToQueueItem } from '../../src/lib/billing/collectionsQueue';
import {
  shouldSkipCalendarMonthRentGeneration,
} from '../../src/lib/billing/billingCoverageModel';
import {
  operationsQueueChipClass,
  operationsQueueChipNeedsAttention,
} from '../../src/lib/operations/operationsQueueChipStyles';

describe('transition invoices in collections queue', () => {
  test('pending transition appears in rent due queue', () => {
    const item = rentRowToQueueItem(
      {
        id: 'x',
        invoiceNumber: 'RNT-2026-09-0001',
        bookingId: 'b',
        bookingCode: 'APG-1',
        customerId: 'c',
        customerFullName: 'Test',
        customerPhone: '9',
        pgId: 'p',
        pgName: 'PG',
        bedCode: 'B1',
        roomNumber: '1',
        billingMonth: '2026-09-01',
        dueDate: null,
        rentPaise: 302_200,
        discountPaise: 0,
        paidPrincipalPaise: 0,
        paidLateFeePaise: 0,
        lateFeeLockedPaise: null,
        status: 'pending',
        paidAt: null,
        createdAt: new Date(),
        notes:
          'Billing cycle transition rent — bridge Billing period: 9 Sep 2026 → 30 Sep 2026',
        paymentProvider: null,
        outstandingPaise: 302_200,
        effectiveStatus: 'pending',
        invoiceSubtype: 'billing_cycle_transition',
        isAdhoc: true,
      },
      '2026-09-01',
    );
    assert.ok(item);
    assert.equal(item!.categoryLabel, 'Billing transition');
    assert.equal(item!.dueDate, null);
    assert.match(item!.periodLabel, /2026-09-09/);
  });
});

describe('shouldSkipCalendarMonthRentGeneration', () => {
  test('skips September when pending bridge ends Sep 30', () => {
    const skip = shouldSkipCalendarMonthRentGeneration({
      billingMonth: '2026-09-01',
      paidUntilDate: '2026-09-08',
      paidInvoiceCoverage: [],
      pendingTransitionPeriods: [
        {
          periodStart: '2026-09-09',
          periodEnd: '2026-09-30',
          source: 'rent_invoice',
          sourceId: 'bridge',
        },
      ],
    });
    assert.equal(skip, true);
  });

  test('does not skip October when September only bridged', () => {
    const skip = shouldSkipCalendarMonthRentGeneration({
      billingMonth: '2026-10-01',
      paidUntilDate: '2026-09-30',
      paidInvoiceCoverage: [],
      pendingTransitionPeriods: [],
    });
    assert.equal(skip, false);
  });
});

describe('operationsQueueChipStyles', () => {
  test('zero count is neutral', () => {
    assert.equal(operationsQueueChipNeedsAttention(0), false);
    assert.match(operationsQueueChipClass(0, false), /text-apg-silver/);
  });

  test('non-zero count is attention', () => {
    assert.equal(operationsQueueChipNeedsAttention(3), true);
    assert.match(operationsQueueChipClass(3, false), /FF5A1F/);
  });
});
