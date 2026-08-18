import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerTimeline,
  fyhCustomers,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhStaff,
  type QuickSalePosDraft,
} from '@/src/hair/db/schema';
import {
  discountBpsFromPaise,
  lineNetPaiseFromParts,
  persistLineAttributions,
} from '@/src/hair/services/salesAttribution';
import { computeGrandTotalFromParts } from '@/src/hair/lib/invoiceMath';
import {
  priceLineDrafts,
  resolveQuickSaleDrafts,
  type PaymentSplitInput,
  type QuickSaleLineInput,
} from '@/src/hair/services/invoices';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

function holdInvoiceNumber() {
  return `HOLD-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export type QuickSaleHoldSummary = {
  invoiceId: string;
  customerId: string;
  customerName: string;
  customerCode: string | null;
  phone: string;
  grandTotalPaise: number;
  lineCount: number;
  updatedAt: Date;
};

export async function listQuickSaleHolds(limit = 40, ctx?: TenantContext | null): Promise<QuickSaleHoldSummary[]> {
  const rows = await hairDb
    .select({
      invoiceId: fyhInvoices.id,
      customerId: fyhInvoices.customerId,
      customerName: fyhCustomers.fullName,
      customerCode: fyhCustomers.customerCode,
      phone: fyhCustomers.phone,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      updatedAt: fyhInvoices.updatedAt,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(and(eq(fyhInvoices.source, 'quick_sale'), eq(fyhInvoices.status, 'draft')))
    .orderBy(desc(fyhInvoices.updatedAt))
    .limit(limit);

  if (!rows.length) return [];

  const ids = rows.map((r) => r.invoiceId);
  const counts = await hairDb
    .select({
      invoiceId: fyhInvoiceLines.invoiceId,
      count: fyhInvoiceLines.id,
    })
    .from(fyhInvoiceLines)
    .where(inArray(fyhInvoiceLines.invoiceId, ids));

  const countByInvoice = new Map<string, number>();
  for (const c of counts) {
    countByInvoice.set(c.invoiceId, (countByInvoice.get(c.invoiceId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    invoiceId: r.invoiceId,
    customerId: r.customerId,
    customerName: r.customerName,
    customerCode: r.customerCode,
    phone: r.phone,
    grandTotalPaise: r.grandTotalPaise,
    lineCount: countByInvoice.get(r.invoiceId) ?? 0,
    updatedAt: r.updatedAt,
  }));
}

export type QuickSaleHoldCartLine = {
  kind: QuickSaleLineInput['kind'];
  refId: string;
  name: string;
  unitPricePaise: number;
  gstBps: number;
  quantity: number;
  lineDiscountPaise: number;
  lineDiscountBps: number;
  servicedBy: Array<{ id: string; fullName: string }>;
  soldBy: { id: string; fullName: string } | null;
};

export type QuickSaleHoldDetail = {
  invoiceId: string;
  customer: {
    id: string;
    fullName: string;
    customerCode: string | null;
    phone: string;
    walletBalancePaise: number;
  };
  cart: QuickSaleHoldCartLine[];
  posDraft: QuickSalePosDraft | null;
  invoiceDiscountPaise: number;
  walletRedeemPaise: number;
  tipPaise: number;
  roundOffPaise: number;
};

export async function loadQuickSaleHold(invoiceId: string, ctx?: TenantContext | null): Promise<QuickSaleHoldDetail | null> {
  const [header] = await hairDb
    .select({
      invoice: fyhInvoices,
      fullName: fyhCustomers.fullName,
      customerCode: fyhCustomers.customerCode,
      phone: fyhCustomers.phone,
      walletBalancePaise: fyhCustomers.walletBalancePaise,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(
      and(
        eq(fyhInvoices.id, invoiceId),
        eq(fyhInvoices.source, 'quick_sale'),
        eq(fyhInvoices.status, 'draft'),
      ),
    )
    .limit(1);
  if (!header) return null;

  const lines = await hairDb
    .select()
    .from(fyhInvoiceLines)
    .where(and(orgFilter(fyhInvoiceLines.organizationId, ctx), locationFilter(fyhInvoiceLines.locationId, ctx), eq(fyhInvoiceLines.invoiceId, invoiceId)))
    .orderBy(fyhInvoiceLines.sortOrder);

  const lineIds = lines.map((l) => l.id);
  const attrRows =
    lineIds.length > 0
      ? await hairDb
          .select({
            lineId: fyhInvoiceLineAttributions.invoiceLineId,
            staffId: fyhInvoiceLineAttributions.staffId,
            role: fyhInvoiceLineAttributions.role,
            shareBps: fyhInvoiceLineAttributions.shareBps,
            fullName: fyhStaff.fullName,
          })
          .from(fyhInvoiceLineAttributions)
          .innerJoin(fyhStaff, eq(fyhStaff.id, fyhInvoiceLineAttributions.staffId))
          .where(inArray(fyhInvoiceLineAttributions.invoiceLineId, lineIds))
      : [];

  const cart: QuickSaleHoldCartLine[] = lines.map((line) => {
    const attrs = attrRows.filter((a) => a.lineId === line.id);
    const refId =
      line.serviceId ?? line.productId ?? line.packageId ?? line.membershipId ?? '';
    const kind = line.kind as QuickSaleLineInput['kind'];
    const servicedBy = attrs
      .filter((a) => a.role === 'serviced_by')
      .map((a) => ({ id: a.staffId, fullName: a.fullName }));
    const sold = attrs.find((a) => a.role === 'sold_by');
    return {
      kind,
      refId,
      name: line.nameSnapshot,
      unitPricePaise: line.unitPricePaise,
      gstBps: line.gstBps,
      quantity: line.quantity,
      lineDiscountPaise: line.discountPaise,
      lineDiscountBps: line.discountBps,
      servicedBy,
      soldBy: sold ? { id: sold.staffId, fullName: sold.fullName } : null,
    };
  });

  const posDraft = header.invoice.posDraft ?? null;
  return {
    invoiceId,
    customer: {
      id: header.invoice.customerId,
      fullName: header.fullName,
      customerCode: header.customerCode,
      phone: header.phone,
      walletBalancePaise: header.walletBalancePaise,
    },
    cart,
    posDraft,
    invoiceDiscountPaise: header.invoice.discountPaise,
    walletRedeemPaise: header.invoice.walletRedemptionPaise,
    tipPaise: header.invoice.tipPaise,
    roundOffPaise: header.invoice.roundOffPaise,
  };
}

export async function saveQuickSaleHold(input: {
  customerId: string;
  lines: QuickSaleLineInput[];
  holdInvoiceId?: string | null;
  posDraft?: QuickSalePosDraft | null;
  discountPaise?: number;
  walletRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
}, ctx?: TenantContext | null): Promise<string> {
  const [customer] = await hairDb
    .select({ id: fyhCustomers.id })
    .from(fyhCustomers)
    .where(and(eq(fyhCustomers.id, input.customerId), eq(fyhCustomers.isActive, true)))
    .limit(1);
  if (!customer) throw new Error('Customer not found');
  if (!input.lines.length) throw new Error('Add at least one item before holding');

  const { drafts, meta: lineMeta } = await resolveQuickSaleDrafts(input.lines);
  const { priced, subtotalPaise, taxPaise } = priceLineDrafts(drafts);

  const discountSubtotal = drafts
    .filter((d) => d.kind === 'service' || d.kind === 'product')
    .reduce(
      (sum, d) => sum + Math.max(0, d.unitPricePaise * d.quantity - d.lineDiscountPaise),
      0,
    );
  const { computeRedemptions } = await import('@/src/hair/services/invoices');
  const redemptions = await computeRedemptions(input.customerId, discountSubtotal, []);
  const discountPaise = Math.max(0, input.discountPaise ?? 0);
  const membershipDiscountPaise = redemptions.membershipDiscountPaise;
  const walletRedeemPaise = Math.min(
    Math.max(0, input.walletRedeemPaise ?? 0),
    redemptions.availableWalletPaise,
  );
  const tipPaise = Math.max(0, input.tipPaise ?? 0);
  const roundOffPaise = input.roundOffPaise ?? 0;

  const { taxPaiseAdjusted, grandTotalPaise } = computeGrandTotalFromParts({
    subtotalPaise,
    taxPaise,
    discountPaise,
    membershipDiscountPaise,
    packageRedeemPaise: 0,
    walletRedeemPaise,
    tipPaise,
    roundOffPaise,
  });

  const defaultStylist = priced.find((l) => l.staffId)?.staffId ?? null;

  return hairDb.transaction(async (tx) => {
    let invoiceId = input.holdInvoiceId ?? null;
    if (invoiceId) {
      const [existing] = await tx
        .select()
        .from(fyhInvoices)
        .where(
          and(
            eq(fyhInvoices.id, invoiceId),
            eq(fyhInvoices.source, 'quick_sale'),
            eq(fyhInvoices.status, 'draft'),
            eq(fyhInvoices.customerId, input.customerId),
          ),
        )
        .limit(1);
      if (!existing) throw new Error('Held bill not found');
      await tx.delete(fyhInvoiceLines).where(and(orgFilter(fyhInvoiceLines.organizationId, ctx), locationFilter(fyhInvoiceLines.locationId, ctx), eq(fyhInvoiceLines.invoiceId, invoiceId)));
      await tx
        .update(fyhInvoices)
        .set({
          stylistId: defaultStylist,
          subtotalPaise,
          discountPaise,
          taxPaise: taxPaiseAdjusted,
          membershipRedemptionPaise: membershipDiscountPaise,
          walletRedemptionPaise: walletRedeemPaise,
          tipPaise,
          roundOffPaise,
          grandTotalPaise,
          posDraft: input.posDraft ?? null,
          updatedAt: new Date(),
        })
        .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.id, invoiceId)));
    } else {
      const invoiceNumber = holdInvoiceNumber();
      const [inv] = await tx
        .insert(fyhInvoices)
        .values({
          invoiceNumber,
          customerId: input.customerId,
          appointmentId: null,
          source: 'quick_sale',
          stylistId: defaultStylist,
          status: 'draft',
          subtotalPaise,
          discountPaise,
          taxPaise: taxPaiseAdjusted,
          membershipRedemptionPaise: membershipDiscountPaise,
          packageRedemptionPaise: 0,
          walletRedemptionPaise: walletRedeemPaise,
          giftCardRedemptionPaise: 0,
          tipPaise,
          roundOffPaise,
          grandTotalPaise,
          amountPaidPaise: 0,
          posDraft: input.posDraft ?? null,
        })
        .returning();
      if (!inv) throw new Error('Failed to save hold');
      invoiceId = inv.id;
    }

    const insertedLines = await tx
      .insert(fyhInvoiceLines)
      .values(
        priced.map((l) => {
          const gross = l.unitPricePaise * l.quantity;
          return {
            invoiceId: invoiceId!,
            kind: l.kind,
            serviceId: l.serviceId ?? null,
            productId: l.productId ?? null,
            packageId: l.packageId ?? null,
            membershipId: l.membershipId ?? null,
            staffId: l.staffId ?? null,
            nameSnapshot: l.description,
            quantity: l.quantity,
            unitPricePaise: l.unitPricePaise,
            discountPaise: l.lineDiscountPaise,
            discountBps: discountBpsFromPaise(gross, l.lineDiscountPaise),
            gstBps: l.gstBps,
            taxPaise: l.taxPaise,
            lineTotalPaise: l.lineTotalPaise,
            sortOrder: l.sortOrder,
          };
        }),
      )
      .returning();

    for (let i = 0; i < insertedLines.length; i++) {
      const row = insertedLines[i]!;
      const src = lineMeta[i]!;
      const lineNet = lineNetPaiseFromParts(
        row.unitPricePaise,
        row.quantity,
        row.discountPaise,
      );
      await persistLineAttributions(tx as unknown as typeof hairDb, row.id, {
        kind: row.kind,
        lineNetPaise: lineNet,
        servicedBy: src.servicedBy,
        soldByStaffId: src.soldByStaffId,
        legacyStaffId: row.staffId,
      });
    }

    return invoiceId!;
  });
}

export type { PaymentSplitInput };
