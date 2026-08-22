import { and, desc, eq, gte, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhCommissionEntries,
  fyhCustomerMemberships,
  fyhCustomerPackages,
  fyhCustomerTimeline,
  fyhCustomers,
  fyhInvoiceLines,
  fyhInvoiceLineAttributions,
  fyhInvoicePayments,
  fyhInvoices,
  fyhMembershipPlans,
  fyhPackagePlans,
  fyhProducts,
  fyhServiceConsumables,
  fyhServices,
  fyhSettings,
  fyhStaff,
  type FyhInvoiceLineKind,
  type FyhPaymentMethod,
} from '@/src/hair/db/schema';
import { sellMembershipWithDb, sellPackageWithDb } from '@/src/hair/services/loyaltyOps';
import { evaluateCommissionsForInvoice } from '@/src/hair/services/commissionEngine';
import { applyMovement } from '@/src/hair/services/stock';
import {
  discountBpsFromPaise,
  persistLineAttributions,
  lineNetPaiseFromParts,
  syncInvoiceLineAttributions,
  type StaffAttributionInput,
} from '@/src/hair/services/salesAttribution';
import { escapeHtml, salonDayBounds } from '@/src/hair/lib/salonTime';
import { SALON_GST_BPS } from '@/src/hair/lib/taxConfig';
import { buildPublicInvoiceDocumentHtml } from '@/src/hair/lib/publicInvoiceDocument';
import { sumInclusiveCartLines } from '@/src/hair/domain/basket/gstInclusiveMath';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type PaymentSplitInput = { method: FyhPaymentMethod; amountPaise: number; reference?: string };

export type InvoiceLineDraft = {
  kind: FyhInvoiceLineKind;
  serviceId?: string | null;
  productId?: string | null;
  packageId?: string | null;
  membershipId?: string | null;
  staffId?: string | null;
  description: string;
  quantity: number;
  unitPricePaise: number;
  lineDiscountPaise: number;
  gstBps: number;
};

export function priceLineDrafts(drafts: InvoiceLineDraft[]) {
  const summed = sumInclusiveCartLines(
    drafts.map((d) => ({
      unitSellingPricePaise: d.unitPricePaise,
      quantity: d.quantity,
      lineDiscountPaise: d.lineDiscountPaise,
      gstBps: d.gstBps,
    })),
  );
  const priced = drafts.map((d, sortOrder) => {
    const p = summed.priced[sortOrder]!;
    return {
      ...d,
      taxPaise: p.gstPaise,
      lineTotalPaise: p.finalLinePaise,
      sortOrder,
    };
  });
  return {
    priced,
    subtotalPaise: summed.subtotalBasePaise,
    taxPaise: summed.taxPaise,
    lineDiscountPaise: summed.lineDiscountPaise,
    inclusiveFinalPaise: summed.inclusiveFinalPaise,
  };
}

export type QuickSaleLineInput = {
  kind: 'service' | 'product' | 'package' | 'membership';
  refId: string;
  staffId?: string | null;
  quantity: number;
  lineDiscountPaise?: number;
  lineDiscountBps?: number;
  servicedBy?: StaffAttributionInput[];
  soldByStaffId?: string | null;
};

export async function listInvoices(limit = 50, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  return hairDb
    .select({
      id: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      customerId: fyhInvoices.customerId,
      customerName: fyhCustomers.fullName,
      status: fyhInvoices.status,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      amountPaidPaise: fyhInvoices.amountPaidPaise,
      createdAt: fyhInvoices.createdAt,
      paidAt: fyhInvoices.paidAt,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(
      and(
        orgFilter(fyhInvoices.organizationId, ctx),
        locationFilter(fyhInvoices.locationId, ctx),
        or(
          ne(fyhInvoices.status, 'draft'),
          ne(fyhInvoices.source, 'quick_sale'),
        ),
      ),
    )
    .orderBy(desc(fyhInvoices.createdAt))
    .limit(limit);
}

export async function getInvoiceDetail(invoiceId: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [invoice] = await hairDb
    .select({
      invoice: fyhInvoices,
      customerName: fyhCustomers.fullName,
      customerPhone: fyhCustomers.phone,
      customerCode: fyhCustomers.customerCode,
      walletBalancePaise: fyhCustomers.walletBalancePaise,
      stylistName: fyhStaff.fullName,
      businessName: fyhSettings.businessName,
      businessAddress: fyhSettings.businessAddress,
      gstin: fyhSettings.gstin,
      invoiceNotes: fyhSettings.invoiceNotes,
      whatsappSettings: fyhSettings.whatsappSettings,
      billingSettings: fyhSettings.billingSettings,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .leftJoin(fyhStaff, eq(fyhStaff.id, fyhInvoices.stylistId))
    .leftJoin(fyhSettings, eq(fyhSettings.organizationId, fyhInvoices.organizationId))
    .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.id, invoiceId)))
    .limit(1);
  if (!invoice) return null;

  const lines = await hairDb
    .select()
    .from(fyhInvoiceLines)
    .where(and(orgFilter(fyhInvoiceLines.organizationId, ctx), locationFilter(fyhInvoiceLines.locationId, ctx), eq(fyhInvoiceLines.invoiceId, invoiceId)))
    .orderBy(fyhInvoiceLines.sortOrder);
  const payments = await hairDb
    .select()
    .from(fyhInvoicePayments)
    .where(and(orgFilter(fyhInvoicePayments.organizationId, ctx), locationFilter(fyhInvoicePayments.locationId, ctx), eq(fyhInvoicePayments.invoiceId, invoiceId)));

  return { ...invoice, lines, payments };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;

function isPublicInvoiceVisible(invoice: typeof fyhInvoices.$inferSelect): boolean {
  return !(invoice.source === 'quick_sale' && invoice.status === 'draft');
}

export function isPublicInvoiceLookupAllowed(ctx: TenantContext | null): boolean {
  return !isFyhSaasTenantEnabled() || !!ctx;
}

export async function getInvoiceDetailByNumber(rawInvoiceNumber: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const invoiceNumber = decodeURIComponent(rawInvoiceNumber).trim();
  if (!invoiceNumber) return null;
  if (!isPublicInvoiceLookupAllowed(ctx)) return null;

  const [invoice] = await hairDb
    .select({
      invoice: fyhInvoices,
      customerName: fyhCustomers.fullName,
      customerPhone: fyhCustomers.phone,
      customerCode: fyhCustomers.customerCode,
      walletBalancePaise: fyhCustomers.walletBalancePaise,
      stylistName: fyhStaff.fullName,
      businessName: fyhSettings.businessName,
      businessAddress: fyhSettings.businessAddress,
      gstin: fyhSettings.gstin,
      invoiceNotes: fyhSettings.invoiceNotes,
      whatsappSettings: fyhSettings.whatsappSettings,
      billingSettings: fyhSettings.billingSettings,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .leftJoin(fyhStaff, eq(fyhStaff.id, fyhInvoices.stylistId))
    .leftJoin(fyhSettings, eq(fyhSettings.organizationId, fyhInvoices.organizationId))
    .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.invoiceNumber, invoiceNumber)))
    .limit(1);
  if (!invoice || !isPublicInvoiceVisible(invoice.invoice)) return null;

  const lines = await hairDb
    .select()
    .from(fyhInvoiceLines)
    .where(and(orgFilter(fyhInvoiceLines.organizationId, ctx), locationFilter(fyhInvoiceLines.locationId, ctx), eq(fyhInvoiceLines.invoiceId, invoice.invoice.id)))
    .orderBy(fyhInvoiceLines.sortOrder);
  const payments = await hairDb
    .select()
    .from(fyhInvoicePayments)
    .where(and(orgFilter(fyhInvoicePayments.organizationId, ctx), locationFilter(fyhInvoicePayments.locationId, ctx), eq(fyhInvoicePayments.invoiceId, invoice.invoice.id)));

  return { ...invoice, lines, payments };
}

export function buildPublicInvoicePrintHtml(detail: InvoiceDetail): string {
  return buildPublicInvoiceDocumentHtml(detail);
}

export async function nextInvoiceNumberForTx(tx: typeof hairDb, ctx?: TenantContext | null): Promise<string> {
  ctx = await resolveTenantContextForService(ctx);
  return nextInvoiceNumber(tx, ctx);
}

async function nextInvoiceNumber(tx: typeof hairDb, ctx?: TenantContext | null): Promise<string> {
  if (ctx?.organizationId && isFyhSaasTenantEnabled()) {
    const rows = await tx.execute<{ prefix: string; next_seq: number }>(sql`
      UPDATE fyh_org_invoice_sequences
      SET next_seq = next_seq + 1, updated_at = now()
      WHERE organization_id = ${ctx.organizationId}
      RETURNING prefix, next_seq
    `);
    const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<{ prefix: string; next_seq: number }> }).rows?.[0];
    if (!row) throw new Error('Organization invoice sequence missing');
    const seq = Number(row.next_seq) - 1;
    const prefix = String(row.prefix || 'INV');
    return `${prefix}-${String(seq).padStart(5, '0')}`;
  }

  const rows = await tx.execute<{ invoice_prefix: string; invoice_next_seq: number }>(sql`
    UPDATE fyh_settings
    SET invoice_next_seq = invoice_next_seq + 1, updated_at = now()
    WHERE id = (SELECT id FROM fyh_settings LIMIT 1)
    RETURNING invoice_prefix, invoice_next_seq
  `);
  const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<{ invoice_prefix: string; invoice_next_seq: number }> }).rows?.[0];
  if (!row) throw new Error('Salon settings missing');
  const seq = Number(row.invoice_next_seq) - 1; // value after increment is next unused; number uses prior
  const prefix = String(row.invoice_prefix || 'FYH');
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

/** Membership / package / wallet hooks. Gift redemption stays 0 until a gift ledger exists. */
export async function computeRedemptions(
  customerId: string,
  subtotalPaise: number,
  serviceIds: string[] = [],
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const today = new Date().toISOString().slice(0, 10);
  let membershipDiscountPaise = 0;
  const [membership] = await hairDb
    .select({
      discountBps: fyhMembershipPlans.discountBps,
      planName: fyhMembershipPlans.name,
      expiresOn: fyhCustomerMemberships.expiresOn,
    })
    .from(fyhCustomerMemberships)
    .innerJoin(fyhMembershipPlans, eq(fyhMembershipPlans.id, fyhCustomerMemberships.planId))
    .where(
      and(
        orgFilter(fyhCustomerMemberships.organizationId, ctx),
        eq(fyhCustomerMemberships.customerId, customerId),
        eq(fyhCustomerMemberships.isActive, true),
        gte(fyhCustomerMemberships.expiresOn, today),
      ),
    )
    .limit(1);
  if (membership) {
    membershipDiscountPaise = Math.round((subtotalPaise * membership.discountBps) / 10_000);
  }

  let packageRedeemPaise = 0;
  let packageId: string | null = null;
  if (serviceIds.length > 0) {
    const [pkg] = await hairDb
      .select({
        id: fyhCustomerPackages.id,
        planPricePaise: fyhPackagePlans.pricePaise,
        totalSessions: fyhCustomerPackages.totalSessions,
        usedSessions: fyhCustomerPackages.usedSessions,
        serviceId: fyhPackagePlans.serviceId,
      })
      .from(fyhCustomerPackages)
      .innerJoin(fyhPackagePlans, eq(fyhPackagePlans.id, fyhCustomerPackages.planId))
      .where(
        and(
          orgFilter(fyhCustomerPackages.organizationId, ctx),
          eq(fyhCustomerPackages.customerId, customerId),
          eq(fyhCustomerPackages.isActive, true),
          eq(fyhCustomerPackages.isFrozen, false),
          inArray(fyhPackagePlans.serviceId, serviceIds),
          or(
            sql`${fyhCustomerPackages.expiresOn} is null`,
            gte(fyhCustomerPackages.expiresOn, today),
          ),
        ),
      )
      .limit(1);
    if (pkg && pkg.usedSessions < pkg.totalSessions) {
      // Credit one session as average plan price
      packageRedeemPaise = Math.round(pkg.planPricePaise / Math.max(1, pkg.totalSessions));
      packageId = pkg.id;
    }
  }

  const [customer] = await hairDb
    .select({
      walletBalancePaise: fyhCustomers.walletBalancePaise,
    })
    .from(fyhCustomers)
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customerId)))
    .limit(1);

  return {
    membershipDiscountPaise,
    packageRedeemPaise,
    packageId,
    walletRedeemPaise: 0,
    giftCardRedeemPaise: 0,
    availableWalletPaise: customer?.walletBalancePaise ?? 0,
    membershipName: membership?.planName ?? null,
  };
}

/** @deprecated Prefer buildBasketFromAppointment + checkoutFromBasket (or Quick Sale POS). */
export async function createInvoiceFromAppointment(
  appointmentId: string,
  opts?: {
    productIds?: Array<{ productId: string; quantity: number }>;
    discountPaise?: number;
    walletRedeemPaise?: number;
    notes?: string;
    createdByAdminId?: string | null;
  },
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const [appt] = await hairDb
    .select({ invoiceId: fyhAppointments.invoiceId })
    .from(fyhAppointments)
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, appointmentId)))
    .limit(1);
  if (appt?.invoiceId) return appt.invoiceId;

  const { buildBasketFromAppointment } = await import('@/src/hair/domain/basket/appointmentBridge');
  const { checkoutFromBasket } = await import('@/src/hair/domain/checkout/pipeline');
  const { basketLineFromBillableItem } = await import('@/src/hair/domain/basket/legacyBridge');
  const { resolveBillableItem } = await import('@/src/hair/domain/catalog/adapter');

  const basket = await buildBasketFromAppointment(appointmentId);

  for (const p of opts?.productIds ?? []) {
    const item = await resolveBillableItem('product', p.productId);
    if (!item) continue;
    const line = basketLineFromBillableItem(item);
    line.quantity = Math.max(1, p.quantity);
    basket.lines.push(line);
  }

  const result = await checkoutFromBasket({
    basket,
    source: 'appointment',
    appointmentId,
    allowUnpaid: true,
    notes: opts?.notes,
  });
  return result.invoiceId;
}

export async function resolveQuickSaleDrafts(
  lines: QuickSaleLineInput[], ctx?: TenantContext | null): Promise<{ drafts: InvoiceLineDraft[]; meta: QuickSaleLineInput[] }> {
  ctx = await resolveTenantContextForService(ctx);
  if (!lines.length) throw new Error('Add at least one item to the cart');
  const drafts: InvoiceLineDraft[] = [];
  for (const line of lines) {
    const qty = Math.max(0.001, line.quantity);
    let lineDiscountPaise = Math.max(0, line.lineDiscountPaise ?? 0);
    if (line.kind === 'service') {
      const [svc] = await hairDb
        .select()
        .from(fyhServices)
        .where(and(orgFilter(fyhServices.organizationId, ctx), eq(fyhServices.id, line.refId)))
        .limit(1);
      if (!svc || !svc.isActive) throw new Error('Service not found');
      const gross = svc.pricePaise * qty;
      if (line.lineDiscountBps != null && line.lineDiscountPaise == null) {
        lineDiscountPaise = Math.min(
          gross,
          Math.round((gross * Math.max(0, line.lineDiscountBps)) / 10_000),
        );
      }
      const primaryStaff =
        line.servicedBy?.[0]?.staffId ?? line.staffId ?? null;
      drafts.push({
        kind: 'service',
        serviceId: svc.id,
        staffId: primaryStaff,
        description: svc.name,
        quantity: qty,
        unitPricePaise: svc.pricePaise,
        lineDiscountPaise,
        gstBps: svc.gstBps,
      });
    } else if (line.kind === 'product') {
      const [product] = await hairDb
        .select()
        .from(fyhProducts)
        .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.id, line.refId)))
        .limit(1);
      if (!product || !product.isActive) throw new Error('Product not found');
      const gross = product.sellingPricePaise * qty;
      if (line.lineDiscountBps != null && line.lineDiscountPaise == null) {
        lineDiscountPaise = Math.min(
          gross,
          Math.round((gross * Math.max(0, line.lineDiscountBps)) / 10_000),
        );
      }
      drafts.push({
        kind: 'product',
        productId: product.id,
        staffId: line.soldByStaffId ?? line.staffId ?? null,
        description: product.name,
        quantity: qty,
        unitPricePaise: product.sellingPricePaise,
        lineDiscountPaise,
        gstBps: SALON_GST_BPS,
      });
    } else if (line.kind === 'package') {
      const [plan] = await hairDb
        .select()
        .from(fyhPackagePlans)
        .where(and(orgFilter(fyhPackagePlans.organizationId, ctx), eq(fyhPackagePlans.id, line.refId)))
        .limit(1);
      if (!plan || !plan.isActive) throw new Error('Package not found');
      drafts.push({
        kind: 'package',
        packageId: plan.id,
        staffId: line.soldByStaffId ?? line.staffId ?? null,
        description: plan.name,
        quantity: qty,
        unitPricePaise: plan.pricePaise,
        lineDiscountPaise,
        gstBps: 0,
      });
    } else {
      const [plan] = await hairDb
        .select()
        .from(fyhMembershipPlans)
        .where(and(orgFilter(fyhMembershipPlans.organizationId, ctx), eq(fyhMembershipPlans.id, line.refId)))
        .limit(1);
      if (!plan || !plan.isActive) throw new Error('Membership not found');
      drafts.push({
        kind: 'membership',
        membershipId: plan.id,
        staffId: line.soldByStaffId ?? line.staffId ?? null,
        description: plan.name,
        quantity: qty,
        unitPricePaise: plan.pricePaise,
        lineDiscountPaise,
        gstBps: 0,
      });
    }
  }
  return { drafts, meta: lines };
}

/** Create quick-sale invoice (unpaid) via basket engine. */
export async function createQuickSaleInvoice(
  customerId: string,
  lines: QuickSaleLineInput[],
  _opts?: {
    discountPaise?: number;
    walletRedeemPaise?: number;
    tipPaise?: number;
    roundOffPaise?: number;
    stylistId?: string | null;
    notes?: string | null;
  },
) {
  const { buildBasketFromQuickSaleLines } = await import(
    '@/src/hair/domain/basket/legacyBridgeServer'
  );
  const { checkoutFromBasket } = await import('@/src/hair/domain/checkout/pipeline');
  const basket = await buildBasketFromQuickSaleLines(customerId, lines, [], {});
  const result = await checkoutFromBasket({ basket, allowUnpaid: true, notes: _opts?.notes });
  return result.invoiceId;
}

/** Create quick-sale invoice and record payments in one flow (basket SSOT). */
export async function finalizeQuickSale(input: {
  customerId: string;
  lines: QuickSaleLineInput[];
  payments: PaymentSplitInput[];
  discountPaise?: number;
  walletRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
  stylistId?: string | null;
  notes?: string | null;
  holdInvoiceId?: string | null;
  markDue?: boolean;
  markFullDue?: boolean;
  creditOverpayAsAdvance?: boolean;
}) {
  const { buildBasketFromQuickSaleLines } = await import(
    '@/src/hair/domain/basket/legacyBridgeServer'
  );
  const { checkoutFromBasket } = await import('@/src/hair/domain/checkout/pipeline');

  const paySum = input.payments.reduce((s, p) => s + Math.max(0, p.amountPaise), 0);
  const basket = await buildBasketFromQuickSaleLines(
    input.customerId,
    input.lines,
    input.payments
      .filter((p) => p.amountPaise > 0 && (p.method === 'cash' || p.method === 'upi' || p.method === 'card'))
      .map((p, i) => ({
        id: `pay-${i}`,
        method: p.method as 'cash' | 'upi' | 'card',
        amountPaise: p.amountPaise,
      })),
    {
      markDue: input.markDue,
      markFullDue: input.markFullDue,
      creditOverpayAsAdvance: input.creditOverpayAsAdvance,
    },
  );

  if (input.markFullDue && paySum === 0) {
    basket.flags.markFullDue = true;
  }

  const result = await checkoutFromBasket({
    basket,
    holdInvoiceId: input.holdInvoiceId,
    notes: input.notes,
  });
  return result.invoiceId;
}

export async function getInvoiceGrandTotal(invoiceId: string, ctx?: TenantContext | null): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select({
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      amountPaidPaise: fyhInvoices.amountPaidPaise,
    })
    .from(fyhInvoices)
    .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.id, invoiceId)))
    .limit(1);
  if (!row) throw new Error('Invoice not found');
  return Math.max(0, row.grandTotalPaise - row.amountPaidPaise);
}

export async function recordInvoicePayments(
  invoiceId: string,
  payments: PaymentSplitInput[],
  _createdByAdminId?: string | null,
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  await hairDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM fyh_invoices WHERE id = ${invoiceId} FOR UPDATE`);
    const [invoice] = await tx
      .select()
      .from(fyhInvoices)
      .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.id, invoiceId)))
      .limit(1);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'void') throw new Error('Invoice is void');
    if (invoice.status === 'paid') {
      throw new Error('Invoice is already paid');
    }
    if (invoice.status === 'draft') {
      throw new Error('Complete checkout from Quick Sale — this bill is still on hold');
    }

    const wasUnpaid = !invoice.paidAt;
    const paySum = payments.reduce((s, p) => s + Math.max(0, p.amountPaise), 0);

    if (invoice.grandTotalPaise === 0) {
      await tx
        .update(fyhInvoices)
        .set({
          status: 'paid',
          paidAt: new Date(),
          amountPaidPaise: 0,
          updatedAt: new Date(),
        })
        .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.id, invoiceId)));
      if (wasUnpaid) {
        await applyPaidSideEffects(tx as unknown as typeof hairDb, invoiceId, ctx);
      }
      return;
    }

    if (paySum <= 0) throw new Error('Enter a payment amount');

    for (const p of payments) {
      if (p.amountPaise <= 0) continue;
      if (p.method === 'wallet') {
        const [customer] = await tx
          .select()
          .from(fyhCustomers)
          .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, invoice.customerId)))
          .limit(1);
        if (!customer || customer.walletBalancePaise < p.amountPaise) {
          throw new Error('Insufficient wallet balance');
        }
        await tx
          .update(fyhCustomers)
          .set({
            walletBalancePaise: customer.walletBalancePaise - p.amountPaise,
            updatedAt: new Date(),
          })
          .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customer.id)));
      }
      if (p.method === 'gift_card') {
        throw new Error('Gift card payments are not available yet');
      }
      await tx.insert(fyhInvoicePayments).values({
        ...tenantWriteDefaults(ctx),
        invoiceId,
        method: p.method,
        amountPaise: p.amountPaise,
        reference: p.reference ?? null,
      });
    }

    const amountPaidPaise = Math.min(
      invoice.amountPaidPaise + paySum,
      invoice.grandTotalPaise,
    );
    const paid = amountPaidPaise >= invoice.grandTotalPaise;
    await tx
      .update(fyhInvoices)
      .set({
        amountPaidPaise,
        status: paid ? 'paid' : amountPaidPaise > 0 ? 'partial' : invoice.status,
        paidAt: paid ? new Date() : invoice.paidAt,
        updatedAt: new Date(),
      })
      .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.id, invoiceId)));

    if (paid && wasUnpaid) {
      await applyPaidSideEffects(tx as unknown as typeof hairDb, invoiceId, ctx);
    }
  });
}

async function applyInventorySideEffects(
  db: typeof hairDb,
  invoiceId: string,
  lines: (typeof fyhInvoiceLines.$inferSelect)[],
  ctx?: TenantContext | null,
) {
  for (const line of lines) {
    if (line.kind === 'service' && line.serviceId) {
      const kits = await db
        .select()
        .from(fyhServiceConsumables)
        .where(and(orgFilter(fyhServiceConsumables.organizationId, ctx), eq(fyhServiceConsumables.serviceId, line.serviceId)));
      for (const kit of kits) {
        if (!kit.deductInventory) continue;
        const qty = Number(kit.quantity) * line.quantity;
        await applyMovement(db, {
          productId: kit.productId,
          quantityDelta: -qty,
          movementType: 'consumption',
          referenceType: 'invoice',
          referenceId: invoiceId,
          notes: `Service consumption · ${line.nameSnapshot}`,
        });
      }
    }

    if (line.kind === 'product' && line.productId) {
      await applyMovement(db, {
        productId: line.productId,
        quantityDelta: -line.quantity,
        movementType: 'sale',
        referenceType: 'invoice',
        referenceId: invoiceId,
        notes: `Retail sale · ${line.nameSnapshot}`,
      });
    }
  }
}

async function updateServiceLineStats(
  db: typeof hairDb,
  lines: (typeof fyhInvoiceLines.$inferSelect)[],
  ctx?: TenantContext | null,
) {
  for (const line of lines) {
    if (line.kind !== 'service' || !line.serviceId) continue;
    await db
      .update(fyhServices)
      .set({
        totalBookings: sql`${fyhServices.totalBookings} + 1`,
        revenueGeneratedPaise: sql`${fyhServices.revenueGeneratedPaise} + ${line.lineTotalPaise}`,
        lastBookedAt: new Date(),
      })
      .where(and(orgFilter(fyhServices.organizationId, ctx), eq(fyhServices.id, line.serviceId)));
  }
}

/** Legacy commission for service lines that have no fyh_invoice_line_attributions rows. */
async function applyLegacyCommissionFallback(
  db: typeof hairDb,
  invoice: { stylistId: string | null; paidAt: Date | null },
  lines: (typeof fyhInvoiceLines.$inferSelect)[],
  ctx?: TenantContext | null,
) {
  if (!lines.length) return;

  const lineIds = lines.map((l) => l.id);
  const attributed = await db
    .select({ invoiceLineId: fyhInvoiceLineAttributions.invoiceLineId })
    .from(fyhInvoiceLineAttributions)
    .where(
      and(
        orgFilter(fyhInvoiceLineAttributions.organizationId, ctx),
        inArray(fyhInvoiceLineAttributions.invoiceLineId, lineIds),
      ),
    );
  const linesWithAttribution = new Set(attributed.map((a) => a.invoiceLineId));

  const periodDate = (invoice.paidAt ?? new Date()).toISOString().slice(0, 10);

  for (const line of lines) {
    if (line.kind !== 'service' || !line.serviceId) continue;
    if (linesWithAttribution.has(line.id)) continue;

    const [service] = await db
      .select()
      .from(fyhServices)
      .where(and(orgFilter(fyhServices.organizationId, ctx), eq(fyhServices.id, line.serviceId)))
      .limit(1);
    const staffId = line.staffId ?? invoice.stylistId;
    if (!staffId || !service) continue;

    let amountPaise = 0;
    if (service.overrideStaffCommission) {
      if (service.commissionType === 'fixed') amountPaise = service.commissionFixedPaise;
      if (service.commissionType === 'percentage') {
        amountPaise = Math.round((line.unitPricePaise * service.commissionPercentBps) / 10_000);
      }
    } else {
      const [staff] = await db.select().from(fyhStaff).where(and(orgFilter(fyhStaff.organizationId, ctx), eq(fyhStaff.id, staffId))).limit(1);
      if (staff?.defaultCommissionType === 'fixed') amountPaise = staff.defaultCommissionFixedPaise;
      if (staff?.defaultCommissionType === 'percentage') {
        amountPaise = Math.round(
          (line.unitPricePaise * staff.defaultCommissionPercentBps) / 10_000,
        );
      }
    }
    if (amountPaise > 0) {
      await db.insert(fyhCommissionEntries).values({
        ...tenantWriteDefaults(ctx),
        staffId,
        invoiceLineId: line.id,
        amountPaise,
        status: 'pending',
        periodDate,
      });
    }
  }
}

export async function applyPaidSideEffects(db: typeof hairDb, invoiceId: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [invoice] = await db.select().from(fyhInvoices).where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.id, invoiceId))).limit(1);
  if (!invoice) return;
  if (invoice.source === 'historical_import') return;

  const lines = await db.select().from(fyhInvoiceLines).where(and(orgFilter(fyhInvoiceLines.organizationId, ctx), locationFilter(fyhInvoiceLines.locationId, ctx), eq(fyhInvoiceLines.invoiceId, invoiceId)));
  const isQuickSale = invoice.source === 'quick_sale';

  if (!isQuickSale) {
    await syncInvoiceLineAttributions(
      db,
      lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        unitPricePaise: line.unitPricePaise,
        quantity: line.quantity,
        discountPaise: line.discountPaise,
        staffId: line.staffId,
      })),
    );
  }

  // Customer stats
  const [customer] = await db
    .select()
    .from(fyhCustomers)
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, invoice.customerId)))
    .limit(1);
  if (customer) {
    const totalVisits = customer.totalVisits + 1;
    const lifetimeSpendPaise = customer.lifetimeSpendPaise + invoice.grandTotalPaise;
    await db
      .update(fyhCustomers)
      .set({
        totalVisits,
        lifetimeSpendPaise,
        averageBillPaise: Math.round(lifetimeSpendPaise / totalVisits),
        lastVisitAt: new Date().toISOString().slice(0, 10),
        walletBalancePaise: Math.max(0, customer.walletBalancePaise - invoice.walletRedemptionPaise),
        updatedAt: new Date(),
      })
      .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customer.id)));
  }

  await updateServiceLineStats(db, lines, ctx);
  await evaluateCommissionsForInvoice(db, invoiceId, ctx);
  await applyLegacyCommissionFallback(db, invoice, lines, ctx);

  if (!isQuickSale) {
    await applyInventorySideEffects(db, invoiceId, lines, ctx);
  }

  if (isQuickSale) {
    await applyInventorySideEffects(db, invoiceId, lines, ctx);
    for (const line of lines) {
      if (line.kind === 'membership' && line.membershipId) {
        await sellMembershipWithDb(db, invoice.customerId, line.membershipId);
      }
      if (line.kind === 'package' && line.packageId) {
        await sellPackageWithDb(db, invoice.customerId, line.packageId);
      }
    }
  }

  if (invoice.appointmentId) {
    await db
      .update(fyhAppointments)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, invoice.appointmentId)));
  }

  // Burn one package session only when package credit was applied and service matches
  if (!isQuickSale && invoice.packageRedemptionPaise > 0) {
    const serviceIds = lines
      .filter((l) => l.kind === 'service' && l.serviceId)
      .map((l) => l.serviceId!);
    if (serviceIds.length > 0) {
      const [pkg] = await db
        .select({
          id: fyhCustomerPackages.id,
          usedSessions: fyhCustomerPackages.usedSessions,
          totalSessions: fyhCustomerPackages.totalSessions,
        })
        .from(fyhCustomerPackages)
        .innerJoin(fyhPackagePlans, eq(fyhPackagePlans.id, fyhCustomerPackages.planId))
        .where(
          and(
            eq(fyhCustomerPackages.customerId, invoice.customerId),
            eq(fyhCustomerPackages.isActive, true),
            eq(fyhCustomerPackages.isFrozen, false),
            inArray(fyhPackagePlans.serviceId, serviceIds),
          ),
        )
        .limit(1);
      if (pkg && pkg.usedSessions < pkg.totalSessions) {
        await db
          .update(fyhCustomerPackages)
          .set({ usedSessions: pkg.usedSessions + 1 })
          .where(and(orgFilter(fyhCustomerPackages.organizationId, ctx), eq(fyhCustomerPackages.id, pkg.id)));
      }
    }
  }

  await db.insert(fyhCustomerTimeline).values({
    ...tenantOrgDefaults(ctx),
    customerId: invoice.customerId,
    eventType: 'bill',
    title: `Invoice ${invoice.invoiceNumber} paid`,
    body: `Collected ${invoice.grandTotalPaise / 100}`,
    metadata: { invoiceId },
  });
}

export async function todayRevenuePaise(ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  let timezone = 'Asia/Kolkata';
  try {
    const [settings] = await hairDb
      .select({ timezone: fyhSettings.timezone })
      .from(fyhSettings)
      .where(orgFilter(fyhSettings.organizationId, ctx))
      .limit(1);
    timezone = settings?.timezone || 'Asia/Kolkata';
  } catch {
    timezone = 'Asia/Kolkata';
  }
  const { start, end } = salonDayBounds(timezone);
  const rows = await hairDb
    .select({ total: sql<number>`coalesce(sum(${fyhInvoices.grandTotalPaise}), 0)::bigint` })
    .from(fyhInvoices)
    .where(
      and(
        orgFilter(fyhInvoices.organizationId, ctx),
        locationFilter(fyhInvoices.locationId, ctx),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, start),
        lt(fyhInvoices.paidAt, end),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export function buildInvoicePrintHtml(
  detail: NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>,
  opts?: { includeStaff?: boolean },
) {
  const { invoice, customerName, customerPhone, stylistName, businessName, businessAddress, gstin, lines, payments } =
    detail;
  const showStaff = opts?.includeStaff === true;
  const money = (p: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
      p / 100,
    );
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    body{font-family:Georgia,serif;color:#14261c;padding:24px;max-width:720px;margin:0 auto}
    h1{font-size:22px;margin:0} .muted{color:#5c6b62;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{text-align:left;padding:8px;border-bottom:1px solid #d7e0d9;font-size:13px}
    .right{text-align:right} .total{font-size:18px;font-weight:700}
  </style></head><body>
  <h1>${escapeHtml(businessName ?? 'For Your Hair')}</h1>
  <p class="muted">${escapeHtml(businessAddress ?? '')}${gstin ? ` · GSTIN ${escapeHtml(gstin)}` : ''}</p>
  <p><strong>Invoice ${escapeHtml(invoice.invoiceNumber)}</strong><br/>
  ${escapeHtml(customerName)} · ${escapeHtml(customerPhone)}<br/>
  ${showStaff && stylistName ? `Stylist: ${escapeHtml(stylistName)}<br/>` : ''}
  Date: ${escapeHtml(invoice.createdAt.toISOString().slice(0, 10))}</p>
  <table><thead><tr><th>Item</th><th>Qty</th><th class="right">Amount</th></tr></thead><tbody>
  ${lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.nameSnapshot)}</td><td>${escapeHtml(String(l.quantity))}</td><td class="right">${money(l.lineTotalPaise)}</td></tr>`,
    )
    .join('')}
  </tbody></table>
  <p class="right">Subtotal ${money(invoice.subtotalPaise)} · Tax ${money(invoice.taxPaise)}
  · Discount ${money(invoice.discountPaise + invoice.membershipRedemptionPaise)}${
    invoice.tipPaise ? ` · Tip ${money(invoice.tipPaise)}` : ''
  }${invoice.roundOffPaise ? ` · Round off ${money(invoice.roundOffPaise)}` : ''}</p>
  <p class="right total">Grand total ${money(invoice.grandTotalPaise)}</p>
  <p class="muted">Payments: ${
    payments.map((p) => `${escapeHtml(p.method)} ${money(p.amountPaise)}`).join(', ') || '—'
  }</p>
  </body></html>`;
}
