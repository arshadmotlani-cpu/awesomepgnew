import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linkedServiceRetailUnitPaise } from '@/src/hair/domain/packages/packageRedemptionInvoiceDisplay';
import {
  buildPublicInvoiceViewModel,
  renderQuickSaleInvoiceSheetHtml,
} from '@/src/hair/lib/publicInvoiceDocument';
import type { InvoiceDetail } from '@/src/hair/services/invoices';

function redemptionLine(input: {
  serviceId: string;
  unitPricePaise: number;
  discountPaise: number;
  quantity: number;
  name?: string;
}) {
  return {
    id: `line-${input.serviceId}`,
    invoiceId: 'inv-1',
    kind: 'service' as const,
    serviceId: input.serviceId,
    productId: null,
    packageId: null,
    membershipId: null,
    staffId: 'staff-1',
    nameSnapshot:
      input.name ??
      `${input.serviceId} · Package Redemption · Qty ${input.quantity} · Prepaid ₹0`,
    quantity: input.quantity,
    unitPricePaise: input.unitPricePaise,
    discountPaise: input.discountPaise,
    discountBps: 10_000,
    gstBps: 0,
    taxPaise: 0,
    lineTotalPaise: 0,
    sortOrder: 0,
    createdAt: new Date('2026-09-17T10:00:00Z'),
  };
}

function mockRedemptionDetail(
  lines: ReturnType<typeof redemptionLine>[],
  serviceSellingPricePaiseById: Record<string, number>,
): InvoiceDetail {
  const base = {
    invoice: {
      id: 'inv-1',
      invoiceNumber: 'FYH-900',
      customerId: 'cust-1',
      appointmentId: null,
      source: 'quick_sale' as const,
      stylistId: null,
      status: 'paid' as const,
      subtotalPaise: 0,
      discountPaise: lines.reduce((s, l) => s + l.discountPaise, 0),
      taxPaise: 0,
      grandTotalPaise: 0,
      amountPaidPaise: 0,
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
      paidAt: new Date('2026-09-17T10:00:00Z'),
      voidedAt: null,
      createdAt: new Date('2026-09-17T10:00:00Z'),
      updatedAt: new Date('2026-09-17T10:00:00Z'),
    },
    customerName: 'Test',
    customerPhone: '9000000000',
    customerCode: null,
    walletBalancePaise: 0,
    stylistName: null,
    businessName: 'Salon',
    businessAddress: '',
    gstin: null,
    invoiceNotes: null,
    whatsappSettings: null,
    billingSettings: null,
    lines,
    payments: [],
    serviceSellingPricePaiseById,
  };
  return base as InvoiceDetail;
}

describe('package redemption invoice Normal Rate', () => {
  it('1 — linked ₹350 service shows Normal Rate ₹350', () => {
    const serviceId = 'svc-wash-350';
    const detail = mockRedemptionDetail(
      [redemptionLine({ serviceId, unitPricePaise: 20_000, discountPaise: 15_000, quantity: 1 })],
      { [serviceId]: 35_000 },
    );
    const vm = buildPublicInvoiceViewModel(detail);
    assert.equal(vm.lines[0]!.normalRateLabel, '₹350');
    assert.equal(vm.lines[0]!.rateLabel, '₹200');
    assert.match(vm.lines[0]!.discountLabel, /150/);
    assert.equal(vm.lines[0]!.totalLabel, '₹0');
  });

  it('2 — linked ₹550 service shows Normal Rate ₹550', () => {
    const serviceId = 'svc-premium-550';
    const detail = mockRedemptionDetail(
      [redemptionLine({ serviceId, unitPricePaise: 18_000, discountPaise: 37_000, quantity: 1 })],
      { [serviceId]: 55_000 },
    );
    const vm = buildPublicInvoiceViewModel(detail);
    assert.equal(vm.lines[0]!.normalRateLabel, '₹550');
    assert.equal(vm.lines[0]!.rateLabel, '₹180');
  });

  it('3 — different linked services do not cross-use prices', () => {
    const svcA = 'svc-a';
    const svcB = 'svc-b';
    const detail = mockRedemptionDetail(
      [
        redemptionLine({
          serviceId: svcA,
          unitPricePaise: 10_000,
          discountPaise: 25_000,
          quantity: 1,
          name: 'Service A · Package Redemption',
        }),
        redemptionLine({
          serviceId: svcB,
          unitPricePaise: 12_000,
          discountPaise: 43_000,
          quantity: 1,
          name: 'Service B · Package Redemption',
        }),
      ],
      { [svcA]: 35_000, [svcB]: 55_000 },
    );
    const vm = buildPublicInvoiceViewModel(detail);
    assert.equal(vm.lines[0]!.normalRateLabel, '₹350');
    assert.equal(vm.lines[1]!.normalRateLabel, '₹550');
    assert.equal(linkedServiceRetailUnitPaise(detail.lines[0]!, detail.serviceSellingPricePaiseById), 35_000);
    assert.equal(linkedServiceRetailUnitPaise(detail.lines[1]!, detail.serviceSellingPricePaiseById), 55_000);
  });

  it('4 — effective rate and discount on invoice line stay unchanged', () => {
    const serviceId = 'svc-fixed';
    const line = redemptionLine({
      serviceId,
      unitPricePaise: 20_300,
      discountPaise: 40_600,
      quantity: 2,
    });
    const detail = mockRedemptionDetail([line], { [serviceId]: 35_000 });
    const vm = buildPublicInvoiceViewModel(detail);
    assert.equal(vm.lines[0]!.rateLabel, '₹203');
    assert.match(vm.lines[0]!.discountLabel, /406/);
    assert.equal(vm.lines[0]!.totalLabel, '₹0');
    const html = renderQuickSaleInvoiceSheetHtml(detail);
    assert.match(html, /Normal Rate ₹350/);
    assert.match(html, /₹203/);
  });

  it('non-package lines omit Normal Rate', () => {
    const detail = mockRedemptionDetail([], {});
    const full: InvoiceDetail = {
      ...detail,
      lines: [
        {
          ...redemptionLine({
            serviceId: 'x',
            unitPricePaise: 60_000,
            discountPaise: 0,
            quantity: 1,
          }),
          nameSnapshot: 'GEL NAILS',
          discountPaise: 0,
          lineTotalPaise: 60_000,
        },
      ],
      invoice: { ...detail.invoice, grandTotalPaise: 60_000, amountPaidPaise: 60_000 },
    };
    const vm = buildPublicInvoiceViewModel(full);
    assert.equal(vm.lines[0]!.normalRateLabel, null);
  });
});
