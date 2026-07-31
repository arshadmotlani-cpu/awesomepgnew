import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_INVOICE_STYLES,
  buildPublicInvoiceDocumentHtml,
  buildPublicInvoiceViewModel,
} from '@/src/hair/lib/publicInvoiceDocument';
import { INVOICE_BUSINESS } from '@/src/hair/lib/invoiceBranding';
import type { InvoiceDetail } from '@/src/hair/services/invoices';

function mockDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const base: InvoiceDetail = {
    invoice: {
      id: 'inv-1',
      invoiceNumber: 'FYH-00100',
      customerId: 'cust-1',
      appointmentId: null,
      source: 'quick_sale',
      stylistId: null,
      status: 'paid',
      subtotalPaise: 100_000,
      discountPaise: 5_000,
      taxPaise: 18_000,
      grandTotalPaise: 113_000,
      amountPaidPaise: 113_000,
      membershipRedemptionPaise: 0,
      packageRedemptionPaise: 0,
      walletRedemptionPaise: 0,
      giftCardRedemptionPaise: 0,
      tipPaise: 0,
      roundOffPaise: 0,
      notes: null,
      posDraft: null,
      importBatchId: null,
      importRowKey: null,
      paidAt: new Date('2026-07-30T10:00:00Z'),
      voidedAt: null,
      createdAt: new Date('2026-07-30T10:00:00Z'),
      updatedAt: new Date('2026-07-30T10:00:00Z'),
    },
    customerName: 'Priya Sharma',
    customerPhone: '9876543210',
    customerCode: 'C-0042',
    walletBalancePaise: 0,
    stylistName: null,
    businessName: 'Legacy DB Name',
    businessAddress: '12 MG Road, Bengaluru',
    gstin: '29ABCDE1234F1Z5',
    invoiceNotes: 'Services once rendered are non-refundable.',
    whatsappSettings: { businessPhone: '+91 98765 43210' },
    billingSettings: { businessEmail: 'hello@foryourhair.in' },
    lines: [
      {
        id: 'line-1',
        invoiceId: 'inv-1',
        kind: 'service',
        serviceId: null,
        productId: null,
        packageId: null,
        membershipId: null,
        staffId: null,
        nameSnapshot: 'Haircut & Styling',
        quantity: 1,
        unitPricePaise: 100_000,
        discountPaise: 5_000,
        discountBps: 0,
        gstBps: 1800,
        taxPaise: 18_000,
        lineTotalPaise: 113_000,
        sortOrder: 0,
        createdAt: new Date('2026-07-30T10:00:00Z'),
      },
    ],
    payments: [{ id: 'pay-1', invoiceId: 'inv-1', method: 'upi', amountPaise: 113_000, reference: null, createdAt: new Date('2026-07-30T10:00:00Z') }],
  };
  return { ...base, ...overrides };
}

describe('buildPublicInvoiceViewModel', () => {
  it('uses invoice-only business constants regardless of DB settings', () => {
    const vm = buildPublicInvoiceViewModel(mockDetail());
    assert.equal(vm.businessName, INVOICE_BUSINESS.name);
    assert.deepEqual(vm.businessAddressLines, INVOICE_BUSINESS.addressLines);
    assert.equal(vm.businessPhone, INVOICE_BUSINESS.phone);
    assert.equal(vm.invoiceNumber, 'FYH-00100');
    assert.equal(vm.customerCode, 'C-0042');
    assert.equal(vm.statusLabel, 'Paid');
    assert.equal(vm.lines.length, 1);
    assert.equal(vm.lines[0]!.name, 'Haircut & Styling');
    assert.equal(vm.showDiscount, true);
    assert.equal(vm.showBalance, false);
    assert.match(vm.amountInWords, /Rupees/i);
  });
});

describe('buildPublicInvoiceDocumentHtml', () => {
  it('renders premium layout with Nagpur address and two-column header', () => {
    const html = buildPublicInvoiceDocumentHtml(mockDetail());
    assert.match(html, /Tax Invoice/);
    assert.match(html, /invoice-brand-logo\.png/);
    assert.match(html, /Shabana Makeup Studio and Academy/);
    assert.match(html, /For Your Hair/);
    assert.match(html, /Kamptee Road/);
    assert.match(html, /Maharashtra 440004/);
    assert.match(html, /9823444886/);
    assert.match(html, /fyh-invoice-brand-col/);
    assert.match(html, /Bill to/);
    assert.match(html, /hello@foryourhair\.in/);
    assert.match(html, /Customer ID: C-0042/);
    assert.match(html, /Authorized signatory/);
    assert.match(html, /QR/);
    assert.match(html, /Thank you for choosing/);
    assert.match(html, /fyh-invoice-sheet/);
    assert.doesNotMatch(html, /12 MG Road, Bengaluru/);
  });

  it('enforces natural A4 sheet width in shared CSS', () => {
    assert.match(PUBLIC_INVOICE_STYLES, /min-width: 210mm/);
    assert.match(PUBLIC_INVOICE_STYLES, /max-width: 210mm/);
  });
});
