import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomers,
  fyhProducts,
  fyhServiceCategories,
  fyhServices,
  fyhStaff,
} from '@/src/hair/db/schema';
import { listMembershipPlans, listPackagePlans } from '@/src/hair/services/loyaltyOps';
import { shouldHideServiceFromBillable } from '@/src/hair/lib/serviceCatalogHygiene';
import { SALON_GST_BPS } from '@/src/hair/lib/taxConfig';
import { computeRedemptions } from '@/src/hair/services/invoices';
import {
  computeInclusiveGrandTotal,
  sumInclusiveCartLines,
} from '@/src/hair/domain/basket/gstInclusiveMath';
import type { QuickSaleLineInput } from '@/src/hair/services/invoices';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type PosCustomerHit = {
  id: string;
  fullName: string;
  customerCode: string | null;
  phone: string;
  walletBalancePaise: number;
};

export async function searchCustomersForPos(query: string, limit = 30, ctx?: TenantContext | null): Promise<PosCustomerHit[]> {
  ctx = await resolveTenantContextForService(ctx);
  const q = query.trim();
  if (q.length < 1) return [];
  const pattern = `%${q}%`;
  const digits = q.replace(/\D/g, '');

  const conditions = [
    ilike(fyhCustomers.fullName, pattern),
    ilike(fyhCustomers.phone, pattern),
    ilike(fyhCustomers.customerCode, pattern),
  ];
  if (digits.length >= 1) {
    conditions.push(sql`regexp_replace(${fyhCustomers.phone}, '[^0-9]', '', 'g') like ${'%' + digits + '%'}`);
  }

  const rows = await hairDb
    .select({
      id: fyhCustomers.id,
      fullName: fyhCustomers.fullName,
      customerCode: fyhCustomers.customerCode,
      phone: fyhCustomers.phone,
      walletBalancePaise: fyhCustomers.walletBalancePaise,
    })
    .from(fyhCustomers)
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.isActive, true), or(...conditions)))
    .orderBy(asc(fyhCustomers.fullName))
    .limit(limit);

  return rows;
}

export type QuickSaleCatalog = {
  services: Array<{
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    pricePaise: number;
    gstBps: number;
  }>;
  products: Array<{
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    pricePaise: number;
    gstBps: number;
  }>;
  packages: Array<{
    id: string;
    name: string;
    pricePaise: number;
    description: string | null;
  }>;
  memberships: Array<{
    id: string;
    name: string;
    pricePaise: number;
    description: string | null;
  }>;
  staff: Array<{ id: string; fullName: string }>;
};

export async function loadQuickSaleCatalog(ctx?: TenantContext | null): Promise<QuickSaleCatalog> {
  ctx = await resolveTenantContextForService(ctx);
  const [services, products, packages, memberships, staff] = await Promise.all([
    hairDb
      .select({
        id: fyhServices.id,
        name: fyhServices.name,
        code: fyhServices.code,
        category: fyhServices.category,
        description: fyhServices.description,
        pricePaise: fyhServices.pricePaise,
        gstBps: fyhServices.gstBps,
      })
      .from(fyhServices)
      .leftJoin(fyhServiceCategories, eq(fyhServices.category, fyhServiceCategories.name))
      .where(and(orgFilter(fyhServices.organizationId, ctx), eq(fyhServices.isActive, true)))
      .orderBy(
        asc(sql`coalesce(${fyhServiceCategories.displayOrder}, 999)`),
        asc(fyhServices.name),
      ),
    hairDb
      .select({
        id: fyhProducts.id,
        name: fyhProducts.name,
        category: fyhProducts.category,
        description: fyhProducts.description,
        pricePaise: fyhProducts.sellingPricePaise,
      })
      .from(fyhProducts)
      .where(and(orgFilter(fyhProducts.organizationId, ctx), eq(fyhProducts.isActive, true), eq(fyhProducts.productType, 'retail')))
      .orderBy(asc(fyhProducts.name)),
    listPackagePlans(ctx).then((rows) =>
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        pricePaise: p.pricePaise,
        description: null as string | null,
      })),
    ),
    listMembershipPlans(ctx).then((rows) =>
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        pricePaise: p.pricePaise,
        description: null as string | null,
      })),
    ),
    hairDb
      .select({ id: fyhStaff.id, fullName: fyhStaff.fullName })
      .from(fyhStaff)
      .where(and(orgFilter(fyhStaff.organizationId, ctx), eq(fyhStaff.isActive, true)))
      .orderBy(asc(fyhStaff.fullName)),
  ]);

  const visibleServices = services.filter((s) => !shouldHideServiceFromBillable(s.name, s.code));

  return {
    services: visibleServices,
    products: products.map((p) => ({ ...p, gstBps: SALON_GST_BPS })),
    packages,
    memberships,
    staff,
  };
}

export type QuickSaleTotalsPreview = {
  subtotalPaise: number;
  taxPaise: number;
  membershipDiscountPaise: number;
  grandTotalPaise: number;
  availableWalletPaise: number;
};

export async function previewQuickSaleTotals(
  customerId: string,
  cartLines: Array<{
    kind: QuickSaleLineInput['kind'];
    unitPricePaise: number;
    quantity: number;
    lineDiscountPaise: number;
    gstBps: number;
  }>,
  _opts?: {
    discountPaise?: number;
    walletRedeemPaise?: number;
    tipPaise?: number;
    roundOffPaise?: number;
  }, ctx?: TenantContext | null): Promise<QuickSaleTotalsPreview> {
  ctx = await resolveTenantContextForService(ctx);
  const summed = sumInclusiveCartLines(
    cartLines.map((l) => ({
      unitSellingPricePaise: l.unitPricePaise,
      quantity: l.quantity,
      lineDiscountPaise: l.lineDiscountPaise,
      gstBps: l.gstBps,
    })),
  );
  const discountSubtotal = cartLines
    .filter((l) => l.kind === 'service' || l.kind === 'product')
    .reduce(
      (sum, l) => sum + Math.max(0, l.unitPricePaise * l.quantity - l.lineDiscountPaise),
      0,
    );
  const redemptions = await computeRedemptions(customerId, discountSubtotal, [], ctx);
  const membershipDiscountPaise = redemptions.membershipDiscountPaise;
  const grandTotalPaise = computeInclusiveGrandTotal({
    inclusiveFinalPaise: summed.inclusiveFinalPaise,
    membershipDiscountPaise,
    packageRedeemPaise: 0,
  });
  return {
    subtotalPaise: summed.subtotalBasePaise,
    taxPaise: summed.taxPaise,
    membershipDiscountPaise,
    grandTotalPaise,
    availableWalletPaise: redemptions.availableWalletPaise,
  };
}

export async function searchStaffForPos(query: string, limit = 20, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const q = query.trim();
  if (q.length < 1) return [];
  const pattern = `%${q}%`;
  return hairDb
    .select({ id: fyhStaff.id, fullName: fyhStaff.fullName, role: fyhStaff.role })
    .from(fyhStaff)
    .where(and(orgFilter(fyhStaff.organizationId, ctx), eq(fyhStaff.isActive, true), ilike(fyhStaff.fullName, pattern)))
    .orderBy(asc(fyhStaff.fullName))
    .limit(limit);
}

export async function getCustomerWalletBalance(customerId: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select({ walletBalancePaise: fyhCustomers.walletBalancePaise })
    .from(fyhCustomers)
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customerId)))
    .limit(1);
  return row?.walletBalancePaise ?? 0;
}
