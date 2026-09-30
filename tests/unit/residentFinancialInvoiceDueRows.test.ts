import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  mapFinancialInvoiceToDueRow,
  isRoomChangePayAllSource,
} from '@/src/lib/residents/residentFinancialInvoiceDueRows';
import { FINANCIAL_INVOICE_PENDING_REVIEW_STATUS } from '@/src/lib/residents/financialInvoicePaymentReviewState';
import { ROOM_CHANGE_INVOICE_SOURCE } from '@/src/services/roomShiftQuote';
import { reconcileRoomChangePayAllAfterChildSettlement } from '@/src/services/roomTransferBilling';

describe('resident financial invoice due rows (room change / ₹90)', () => {
  const base = {
    id: 'inv-fee',
    invoiceNumber: 'INV-TEST-001',
    notes: 'Room change fee',
    sourceTable: ROOM_CHANGE_INVOICE_SOURCE.fee,
    amountPaise: 9_000,
    paidPaise: 0,
    status: 'sent',
    dueDate: '2026-09-26',
    roomNumber: '102',
    bedCode: 'B1',
    paymentLinkId: 'link-1',
    paymentLink: null as const,
  };

  test('A — unpaid ₹90 fee shows as due with pay link', () => {
    const row = mapFinancialInvoiceToDueRow(base);
    assert.ok(row);
    assert.equal(row!.amountPaise, 9_000);
    assert.equal(row!.href, '/pay/link-1');
    assert.notEqual(row!.status, FINANCIAL_INVOICE_PENDING_REVIEW_STATUS);
  });

  test('B — txn ID submitted on payment link → pending verification, not unpaid due', () => {
    const row = mapFinancialInvoiceToDueRow({
      ...base,
      paymentLink: {
        status: 'active',
        paymentProofUrl: null,
        paymentProofTransactionRef: '661373848352',
      },
    });
    assert.ok(row);
    assert.equal(row!.status, FINANCIAL_INVOICE_PENDING_REVIEW_STATUS);
    assert.equal(row!.href, null);
    assert.equal(row!.amountPaise, 9_000);
  });

  test('C — pay-all aggregate never appears as its own due row', () => {
    assert.equal(isRoomChangePayAllSource(ROOM_CHANGE_INVOICE_SOURCE.payAll), true);
    const row = mapFinancialInvoiceToDueRow({
      ...base,
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
    });
    assert.equal(row, null);
  });

  test('D — paid invoice produces no due row', () => {
    const row = mapFinancialInvoiceToDueRow({
      ...base,
      paidPaise: 9_000,
      status: 'paid',
    });
    assert.equal(row, null);
  });

  test('E — rejected proof with no new submission stays payable (no link proof)', () => {
    const row = mapFinancialInvoiceToDueRow({
      ...base,
      paymentLink: {
        status: 'active',
        paymentProofUrl: null,
        paymentProofTransactionRef: null,
      },
    });
    assert.ok(row);
    assert.notEqual(row!.status, FINANCIAL_INVOICE_PENDING_REVIEW_STATUS);
  });
});

describe('reconcileRoomChangePayAllAfterChildSettlement', () => {
  test('export exists for invoice payment hook', () => {
    assert.equal(typeof reconcileRoomChangePayAllAfterChildSettlement, 'function');
  });
});
