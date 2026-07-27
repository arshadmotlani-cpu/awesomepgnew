import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOCUMENT_ONLY_INVOICE_FOOTER,
  DOCUMENT_ONLY_INVOICE_TITLE,
  hotelAccommodationLineLabel,
} from '../../src/lib/billing/companyReimbursementCopy';
import { displayRatePerDayPaise } from '../../src/lib/billing/companyReimbursementCopy';
import { computeInvoiceDocumentTotals } from '../../src/lib/billing/invoiceDocumentModel';
import { isCompanyReimbursementInvoice } from '../../src/lib/billing/documentOnlyInvoice';

const root = join(process.cwd());

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
        label: 'Hotel Accommodation',
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

test('company reimbursement detector still identifies internal type', () => {
  assert.equal(
    isCompanyReimbursementInvoice({ invoiceType: 'company_reimbursement', isDocumentOnly: true }),
    true,
  );
  assert.equal(isCompanyReimbursementInvoice({ invoiceType: 'rent', isDocumentOnly: false }), false);
});

test('resident-facing copy is hotel tax invoice without reimbursement wording', () => {
  assert.match(DOCUMENT_ONLY_INVOICE_TITLE, /Tax Invoice/i);
  assert.match(DOCUMENT_ONLY_INVOICE_FOOTER, /Hotel/i);
  assert.doesNotMatch(DOCUMENT_ONLY_INVOICE_FOOTER, /reimbursement/i);
  assert.doesNotMatch(hotelAccommodationLineLabel(7, 171_429), /reimbursement/i);
  assert.match(hotelAccommodationLineLabel(7, 171_429), /Hotel Accommodation/);
});

test('resident invoices list includes document-only financial invoices', () => {
  const area = readFileSync(
    join(root, 'src/components/customer/account/ResidentAreaSection.tsx'),
    'utf8',
  );
  assert.match(area, /listResidentDocumentInvoicesForCustomer/);
  const svc = readFileSync(join(root, 'src/services/residentDocumentInvoices.ts'), 'utf8');
  assert.match(svc, /isDocumentOnly/);
  assert.match(svc, /Tax Invoice · Hotel accommodation/);
  assert.doesNotMatch(svc, /reimbursement/i);
});

test('admin revenue surfaces still exclude document-only invoices', () => {
  const cmd = readFileSync(join(root, 'src/services/invoiceCommandCenter.ts'), 'utf8');
  assert.match(cmd, /excludeDocumentOnlyFinancialInvoices/);
  const rfe = readFileSync(join(root, 'src/services/residentFinancialEngine.ts'), 'utf8');
  assert.match(rfe, /isDocumentOnly, false/);
});
