import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkDuplicateInvoices,
  checkInvoiceEmpty,
  checkInvoiceTotalMismatch,
  computeFinancialInvoiceOutstanding,
  depositShortfallOnOpenInvoices,
  sumBreakdownLines,
} from '../../src/services/financialIntegrityAudit';

test('sumBreakdownLines sums line amounts', () => {
  assert.equal(
    sumBreakdownLines({ lines: [{ kind: 'rent', label: 'Rent', amountPaise: 500000 }] }),
    500000,
  );
  assert.equal(
    sumBreakdownLines({
      lines: [
        { kind: 'rent', label: 'Rent', amountPaise: 300000 },
        { kind: 'deposit', label: 'Deposit', amountPaise: 100000 },
      ],
    }),
    400000,
  );
});

test('checkInvoiceEmpty flags non-cancelled invoice with amount but no lines', () => {
  const issue = checkInvoiceEmpty(
    {
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      status: 'sent',
      amountPaise: 50000,
      breakdown: { lines: [] },
      customerId: 'cust-1',
    },
    'Test Resident',
  );
  assert.ok(issue);
  assert.equal(issue.checkType, 'INVOICE_EMPTY');
});

test('checkInvoiceEmpty ignores cancelled invoices', () => {
  const issue = checkInvoiceEmpty(
    {
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      status: 'cancelled',
      amountPaise: 50000,
      breakdown: {},
      customerId: 'cust-1',
    },
    'Test Resident',
  );
  assert.equal(issue, null);
});

test('checkInvoiceTotalMismatch detects amount vs line sum drift', () => {
  const issue = checkInvoiceTotalMismatch(
    {
      id: 'inv-2',
      invoiceNumber: 'INV-002',
      status: 'sent',
      amountPaise: 600000,
      breakdown: {
        lines: [{ kind: 'rent', label: 'Rent', amountPaise: 500000 }],
      },
      customerId: 'cust-1',
    },
    'Test Resident',
  );
  assert.ok(issue);
  assert.equal(issue.checkType, 'INVOICE_TOTAL_MISMATCH');
  assert.equal(issue.autoRepairable, true);
});

test('checkDuplicateInvoices flags multiple active invoices for same key', () => {
  const issue = checkDuplicateInvoices(
    [
      {
        id: 'a',
        invoiceNumber: 'RNT-1',
        bookingId: 'bk-1',
        billingMonth: '2026-06-01',
        invoiceType: 'rent',
        status: 'sent',
        customerId: 'cust-1',
      },
      {
        id: 'b',
        invoiceNumber: 'RNT-2',
        bookingId: 'bk-1',
        billingMonth: '2026-06-01',
        invoiceType: 'rent',
        status: 'overdue',
        customerId: 'cust-1',
      },
    ],
    'Test Resident',
  );
  assert.ok(issue);
  assert.equal(issue.checkType, 'DUPLICATE_INVOICE');
  assert.equal(issue.autoRepairable, false);
});

test('computeFinancialInvoiceOutstanding respects paidPaise on partial', () => {
  assert.equal(
    computeFinancialInvoiceOutstanding({
      status: 'partial',
      amountPaise: 100000,
      breakdown: { paidPaise: 40000, lines: [{ kind: 'rent', label: 'R', amountPaise: 100000 }] },
    }),
    60000,
  );
  assert.equal(
    computeFinancialInvoiceOutstanding({
      status: 'paid',
      amountPaise: 100000,
      breakdown: { paidPaise: 100000 },
    }),
    0,
  );
});

test('depositShortfallOnOpenInvoices sums deposit lines on open invoices', () => {
  const covered = depositShortfallOnOpenInvoices([
    {
      status: 'sent',
      invoiceType: 'deposit',
      breakdown: {
        lines: [{ kind: 'deposit', label: 'Deposit due', amountPaise: 25000 }],
      },
    },
    {
      status: 'paid',
      invoiceType: 'combined',
      breakdown: {
        lines: [{ kind: 'deposit', label: 'Paid', amountPaise: 50000 }],
      },
    },
  ]);
  assert.equal(covered, 25000);
});
