import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeInvoiceRegisterPdfSummary,
  renderInvoiceRegisterPdfHtml,
  resolveInvoiceRegisterPdfBranding,
} from '@/src/hair/lib/export/invoiceRegisterPdf';
import { INVOICE_REGISTER_BRAND } from '@/src/hair/lib/invoiceBranding';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';

function sampleRow(overrides: Partial<InvoiceRegisterRow> = {}): InvoiceRegisterRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    invoiceNumber: 'FYH-00099',
    invoiceDate: new Date('2026-04-15T10:00:00.000Z'),
    customerName: 'Test Customer',
    mobile: '9876543210',
    servicesSummary: 'Haircut',
    paymentModes: 'UPI',
    taxablePaise: 100000,
    gstPaise: 18000,
    grandTotalPaise: 118000,
    paidPaise: 118000,
    status: 'paid',
    ...overrides,
  };
}

describe('invoice register PDF branding', () => {
  it('uses register brand display name and settings contact fields', () => {
    const branding = resolveInvoiceRegisterPdfBranding({
      businessName: 'For Your Hair',
      businessAddress: 'Shop 1, Nagpur',
      gstin: '27AAAAA0000A1Z5',
      timezone: 'Asia/Kolkata',
      billingSettings: { businessEmail: 'accounts@fyhair.example' } as never,
      whatsappSettings: { businessPhone: '9823444886' } as never,
    });

    assert.equal(branding.displayName, INVOICE_REGISTER_BRAND.displayName);
    assert.equal(branding.documentSubtitle, 'Professional Invoice Register');
    assert.equal(branding.tradeName, 'For Your Hair');
    assert.equal(branding.gstin, '27AAAAA0000A1Z5');
    assert.equal(branding.email, 'accounts@fyhair.example');
    assert.equal(branding.phone, '9823444886');
    assert.equal(branding.timezone, 'Asia/Kolkata');
    assert.match(branding.logoUrl, /invoice-brand-logo\.png$/);
  });
});

describe('invoice register PDF HTML', () => {
  it('renders professional register without UTC and with summary + columns', () => {
    const rows = [
      sampleRow(),
      sampleRow({
        id: '22222222-2222-2222-2222-222222222222',
        invoiceNumber: 'FYH-00100',
        grandTotalPaise: 236000,
        paidPaise: 100000,
        taxablePaise: 200000,
        gstPaise: 36000,
        paymentModes: 'Cash',
        status: 'partial',
      }),
    ];
    const branding = resolveInvoiceRegisterPdfBranding(null);
    const summary = computeInvoiceRegisterPdfSummary(rows, {
      cashPaise: 100000,
      upiPaise: 118000,
      cardPaise: 0,
      walletPaise: 0,
      otherPaise: 0,
    });

    const html = renderInvoiceRegisterPdfHtml({
      rows,
      branding,
      period: {
        from: new Date('2026-04-01T00:00:00+05:30'),
        to: new Date('2026-07-01T00:00:00+05:30'),
      },
      summary,
      generatedAt: new Date('2026-08-03T12:04:00+05:30'),
      autoPrint: false,
    });

    assert.match(html, /Shabana Makeovers &amp; For Your Hair/);
    assert.match(html, /Professional Invoice Register/);
    assert.match(html, /Reporting period/);
    assert.match(html, /01 Apr 2026/);
    assert.match(html, /30 Jun 2026/);
    assert.match(html, /03 Aug 2026/);
    assert.match(html, /IST/);
    assert.doesNotMatch(html, /\bUTC\b/);
    assert.doesNotMatch(html, /FYH Invoice Register/);
    assert.match(html, /Total invoices/);
    assert.match(html, /Total revenue/);
    assert.match(html, />Cash</);
    assert.match(html, />UPI</);
    assert.match(html, />Card</);
    assert.match(html, />Wallet</);
    assert.match(html, /Outstanding/);
    assert.match(html, /GST collected/);
    assert.match(html, /Taxable value/);
    assert.match(html, /Average invoice/);
    assert.match(html, /Invoice #/);
    assert.match(html, /Prepared by/);
    assert.match(html, /For Your Hair ERP/);
    assert.match(html, /Page " counter\(page\) " of " counter\(pages\)/);
    assert.match(html, /class="alt"/);
    assert.match(html, /class="num"/);
    assert.equal(summary.totalInvoices, 2);
    assert.equal(summary.outstandingPaise, 136000);
    assert.equal(summary.averageInvoicePaise, Math.round((118000 + 236000) / 2));
  });
});
