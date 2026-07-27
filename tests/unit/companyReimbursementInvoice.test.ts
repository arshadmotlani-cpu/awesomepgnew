import test from 'node:test';
import assert from 'node:assert/strict';
import { displayRatePerDayPaise } from '../../src/lib/billing/companyReimbursementCopy';
import { computeInvoiceDocumentTotals } from '../../src/lib/billing/invoiceDocumentModel';
import { isCompanyReimbursementInvoice } from '../../src/lib/billing/documentOnlyInvoice';

test('display rate rounds for 12000/7 while total stays exact', () => {
  const totalPaise = 1_200_000;
  const rate = displayRatePerDayPaise(totalPaise, 7);
  assert.equal(rate, 171_429);
  assert.equal((rate / 100).toFixed(2), '1714.29');
  assert.equal(totalPaise, 1_200_000);
});

test('document-only totals keep balance at zero and do not invent paid amount', () => {
  const totals = computeInvoiceDocumentTotals({
    amountPaise: 1_200_000,
    status: 'settled',
    breakdown: { otherPaise: 1_200_000 },
    lineItems: [
      {
        kind: 'company_reimbursement',
        label: 'Accommodation',
        subtitle: null,
        period: '21 July 2026 – 27 July 2026',
        amountPaise: 1_200_000,
      },
    ],
    isDocumentOnly: true,
  });
  assert.equal(totals.totalPaise, 1_200_000);
  assert.equal(totals.balanceDuePaise, 0);
  assert.equal(totals.paidPaise, 0);
});

test('company reimbursement detector', () => {
  assert.equal(
    isCompanyReimbursementInvoice({ invoiceType: 'company_reimbursement', isDocumentOnly: true }),
    true,
  );
  assert.equal(isCompanyReimbursementInvoice({ invoiceType: 'rent', isDocumentOnly: false }), false);
});
