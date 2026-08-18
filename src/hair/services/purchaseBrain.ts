import { and, desc, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhPurchases,
  fyhVendorPayables,
  fyhVendorPaymentAllocations,
  fyhVendorPayments,
  fyhVendors,
  type FyhPayableStatus,
  type FyhVendorPayment,
} from '@/src/hair/db/schema';
import { getPurchaseEngineDetail } from '@/src/hair/services/purchaseEngine';
import { getVendorUnallocatedAdvance } from '@/src/hair/services/vendorPaymentEngine';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export { explainPurchase } from '@/src/hair/lib/purchaseExplain';

export type VendorLedgerInvoiceRow = {
  purchaseId: string;
  payableId: string;
  invoiceNumber: string;
  purchaseDate: string;
  amountPaise: number;
  paidPaise: number;
  balancePaise: number;
  status: FyhPayableStatus;
};

export type VendorLedgerPaymentRow = {
  payment: FyhVendorPayment;
  allocatedPaise: number;
  unallocatedPaise: number;
};

export async function listPurchases(limit = 200, ctx?: TenantContext | null) {
  return hairDb
    .select({
      purchase: fyhPurchases,
      vendorName: fyhVendors.name,
      balancePaise: fyhVendorPayables.balancePaise,
      payableStatus: fyhVendorPayables.status,
    })
    .from(fyhPurchases)
    .innerJoin(fyhVendors, eq(fyhVendors.id, fyhPurchases.vendorId))
    .leftJoin(fyhVendorPayables, eq(fyhVendorPayables.purchaseId, fyhPurchases.id))
    .where(and(orgFilter(fyhPurchases.organizationId, ctx), locationFilter(fyhPurchases.locationId, ctx)))
    .orderBy(desc(fyhPurchases.purchaseDate), desc(fyhPurchases.createdAt))
    .limit(limit);
}

export async function getPurchase(purchaseId: string, ctx?: TenantContext | null) {
  return getPurchaseEngineDetail(purchaseId, ctx);
}

export async function getVendorOutstanding(vendorId: string, ctx?: TenantContext | null) {
  // Invoice-level payables only — vendor total is always derived, never stored.
  const [row] = await hairDb
    .select({
      outstandingPaise: sql<number>`coalesce(sum(${fyhVendorPayables.balancePaise}), 0)`,
    })
    .from(fyhVendorPayables)
    .where(and(orgFilter(fyhVendorPayables.organizationId, ctx), eq(fyhVendorPayables.vendorId, vendorId)));
  return Number(row?.outstandingPaise ?? 0);
}

export async function getVendorLedgerInvoices(
  vendorId: string,
  ctx?: TenantContext | null,
): Promise<VendorLedgerInvoiceRow[]> {
  const rows = await hairDb
    .select({
      purchase: fyhPurchases,
      payable: fyhVendorPayables,
    })
    .from(fyhVendorPayables)
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhVendorPayables.purchaseId))
    .where(
      and(
        orgFilter(fyhVendorPayables.organizationId, ctx),
        locationFilter(fyhPurchases.locationId, ctx),
        eq(fyhVendorPayables.vendorId, vendorId),
      ),
    )
    .orderBy(desc(fyhPurchases.purchaseDate), desc(fyhPurchases.createdAt));

  return rows.map(({ purchase, payable }) => ({
    purchaseId: purchase.id,
    payableId: payable.id,
    invoiceNumber: purchase.vendorInvoiceRef?.trim() || purchase.purchaseNumber,
    purchaseDate: purchase.purchaseDate,
    amountPaise: payable.amountPaise,
    paidPaise: payable.amountPaise - payable.balancePaise,
    balancePaise: payable.balancePaise,
    status: payable.status,
  }));
}

export async function listVendorLedgerPayments(
  vendorId: string,
  ctx?: TenantContext | null,
): Promise<VendorLedgerPaymentRow[]> {
  const payments = await hairDb
    .select()
    .from(fyhVendorPayments)
    .where(and(orgFilter(fyhVendorPayments.organizationId, ctx), eq(fyhVendorPayments.vendorId, vendorId)))
    .orderBy(desc(fyhVendorPayments.paymentDate), desc(fyhVendorPayments.createdAt));

  const rows: VendorLedgerPaymentRow[] = [];
  for (const payment of payments) {
    const [allocRow] = await hairDb
      .select({
        total: sql<number>`coalesce(sum(${fyhVendorPaymentAllocations.amountPaise}), 0)`,
      })
      .from(fyhVendorPaymentAllocations)
      .where(
        and(
          orgFilter(fyhVendorPaymentAllocations.organizationId, ctx),
          eq(fyhVendorPaymentAllocations.paymentId, payment.id),
        ),
      );

    const allocatedPaise = Number(allocRow?.total ?? 0);
    const unallocatedPaise =
      payment.status === 'reversed' ? 0 : payment.amountPaise - allocatedPaise;
    rows.push({ payment, allocatedPaise, unallocatedPaise });
  }
  return rows;
}

export async function getVendorLedger(vendorId: string, ctx?: TenantContext | null) {
  const [vendor] = await hairDb
    .select()
    .from(fyhVendors)
    .where(and(orgFilter(fyhVendors.organizationId, ctx), eq(fyhVendors.id, vendorId)))
    .limit(1);
  if (!vendor) return null;

  const [outstandingPaise, invoices, payments, unallocatedAdvancePaise] = await Promise.all([
    getVendorOutstanding(vendorId, ctx),
    getVendorLedgerInvoices(vendorId, ctx),
    listVendorLedgerPayments(vendorId, ctx),
    getVendorUnallocatedAdvance(vendorId, ctx),
  ]);

  return {
    vendor,
    outstandingPaise,
    unallocatedAdvancePaise,
    invoices,
    payments,
  };
}
