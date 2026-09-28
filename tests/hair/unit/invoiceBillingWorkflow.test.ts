import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocatePerformancePaise } from '@/src/hair/lib/attributionMath';
import {
  appendCancellationAudit,
  invoiceCanBeCancelled,
  openReceivableOnInvoiceLedger,
  planInvoiceCancellationLedger,
  walletRedeemedOnInvoiceLedger,
} from '@/src/hair/lib/billing/invoiceCancellationPlan';
import {
  displayInvoiceStatus,
  settlementReconciles,
  summarizeInvoiceSettlement,
} from '@/src/hair/lib/billing/invoiceSettlement';
import { invoiceActionsUseSheet } from '@/src/hair/lib/ui/invoiceActionLayout';
import type { FyhInvoiceStatus } from '@/src/hair/db/schema/billing';

function settle(
  status: FyhInvoiceStatus,
  grandTotalPaise: number,
  payments: Array<{ method: string; amountPaise: number }>,
) {
  return summarizeInvoiceSettlement({
    subtotalPaise: grandTotalPaise,
    discountPaise: 0,
    taxPaise: 0,
    grandTotalPaise,
    status,
    payments,
  });
}

describe('invoice settlement', () => {
  it('records full cash, UPI, and card without a remaining due', () => {
    for (const method of ['cash', 'upi', 'card'] as const) {
      const row = settle('paid', 100_000, [{ method, amountPaise: 100_000 }]);
      assert.equal(row.totalCollectedPaise, 100_000);
      assert.equal(row.duePaise, 0);
      assert.equal(row.displayStatus, 'paid');
      assert.equal(settlementReconciles(row), true);
    }
  });

  it('keeps a partial payment and a full due as outstanding', () => {
    const partial = settle('partial', 100_000, [{ method: 'cash', amountPaise: 40_000 }]);
    assert.equal(partial.duePaise, 60_000);
    assert.equal(partial.displayStatus, 'partial');
    assert.equal(settlementReconciles(partial), true);

    const due = settle('unpaid', 100_000, []);
    assert.equal(due.totalCollectedPaise, 0);
    assert.equal(due.duePaise, 100_000);
    assert.equal(due.displayStatus, 'unpaid');
    assert.notEqual(due.displayStatus, 'paid');
  });

  it('separates customer credit from collected tenders', () => {
    const creditOnly = settle('paid', 100_000, [{ method: 'wallet', amountPaise: 100_000 }]);
    assert.equal(creditOnly.creditUsedPaise, 100_000);
    assert.equal(creditOnly.totalCollectedPaise, 0);
    assert.equal(creditOnly.duePaise, 0);
    assert.equal(settlementReconciles(creditOnly), true);

    const mixed = settle('paid', 100_000, [
      { method: 'wallet', amountPaise: 30_000 },
      { method: 'upi', amountPaise: 70_000 },
    ]);
    assert.equal(mixed.creditUsedPaise, 30_000);
    assert.equal(mixed.upiPaise, 70_000);
    assert.equal(mixed.duePaise, 0);
    assert.equal(settlementReconciles(mixed), true);
  });

  it('splits cash and UPI and reconciles the due', () => {
    const split = settle('partial', 100_000, [
      { method: 'cash', amountPaise: 25_000 },
      { method: 'upi', amountPaise: 25_000 },
    ]);
    assert.equal(split.cashPaise, 25_000);
    assert.equal(split.upiPaise, 25_000);
    assert.equal(split.totalCollectedPaise, 50_000);
    assert.equal(split.duePaise, 50_000);
    assert.equal(
      split.grandTotalPaise,
      split.creditUsedPaise + split.totalCollectedPaise + split.duePaise,
    );
  });

  it('does not present a short payment as paid', () => {
    const row = settle('paid', 100_000, [{ method: 'cash', amountPaise: 10_000 }]);
    assert.equal(row.displayStatus, 'partial');
    assert.equal(displayInvoiceStatus({
      status: 'paid',
      grandTotalPaise: 100_000,
      amountPaidPaise: 10_000,
    }), 'partial');
  });

  it('keeps a cancelled invoice out of the active paid state', () => {
    const row = settle('void', 100_000, [{ method: 'cash', amountPaise: 100_000 }]);
    assert.equal(row.displayStatus, 'void');
    assert.equal(invoiceCanBeCancelled('void'), false);
    assert.equal(invoiceCanBeCancelled('paid'), true);
  });
});

describe('staff allocation is independent of payment', () => {
  it('splits one service across two staff equally for every tender', () => {
    const staff = [{ staffId: 'staff-a' }, { staffId: 'staff-b' }];
    const first = allocatePerformancePaise(100_000, staff);
    assert.equal(first[0]!.attributedPaise + first[1]!.attributedPaise, 100_000);
    assert.equal(first[0]!.attributedPaise, 50_000);
    assert.equal(first[1]!.attributedPaise, 50_000);

    for (const method of ['cash', 'upi', 'card', 'wallet', 'due']) {
      const again = allocatePerformancePaise(100_000, staff);
      assert.deepEqual(
        again.map((row) => row.attributedPaise),
        first.map((row) => row.attributedPaise),
        method,
      );
    }
  });

  it('keeps a single staff member on the full service amount', () => {
    const rows = allocatePerformancePaise(80_000, [{ staffId: 'staff-a', shareBps: 10_000 }]);
    assert.equal(rows[0]!.attributedPaise, 80_000);
  });
});

describe('invoice cancellation plan', () => {
  it('closes open dues and restores wallet credit without deleting history', () => {
    const entries = [
      {
        kind: 'receivable_open',
        direction: 'debit',
        account: 'accounts_receivable',
        amountPaise: 40_000,
      },
      {
        kind: 'wallet_redemption',
        direction: 'debit',
        account: 'customer_wallet',
        amountPaise: 20_000,
      },
    ];
    assert.equal(openReceivableOnInvoiceLedger(entries), 40_000);
    assert.equal(walletRedeemedOnInvoiceLedger(entries), 20_000);
    const plan = planInvoiceCancellationLedger({
      openReceivablePaise: 40_000,
      walletRedeemedPaise: 20_000,
    });
    assert.equal(plan.length, 2);
    assert.equal(plan[0]!.kind, 'receivable_settled');
    assert.equal(plan[1]!.kind, 'advance_credit');
  });

  it('appends the operator, time, and reason onto existing notes', () => {
    const notes = appendCancellationAudit('Original note', {
      at: new Date('2026-09-28T10:00:00.000Z'),
      actor: 'Arshad',
      reason: 'Wrong service',
    });
    assert.match(notes, /^Original note\n/);
    assert.match(notes, /by Arshad/);
    assert.match(notes, /Wrong service/);
  });
});

describe('mobile invoice actions', () => {
  it('uses a viewport sheet on phone widths and an anchored menu on desktop', () => {
    assert.equal(invoiceActionsUseSheet(390), true);
    assert.equal(invoiceActionsUseSheet(767), true);
    assert.equal(invoiceActionsUseSheet(768), false);
    assert.equal(invoiceActionsUseSheet(1280), false);
  });
});
