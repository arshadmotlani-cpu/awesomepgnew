import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomers,
  fyhProducts,
  fyhServices,
  fyhStaff,
} from '@/src/hair/db/schema';
import { listMembershipPlans, listPackagePlans } from '@/src/hair/services/loyaltyOps';
import { computeRedemptions } from '@/src/hair/services/invoices';
import { computeGrandTotalFromParts, sumCartLines } from '@/src/hair/lib/invoiceMath';
import type { QuickSaleLineInput } from '@/src/hair/services/invoices';

export type PosCustomerHit = {
  id: string;
  fullName: string;
  customerCode: string | null;
  phone: string;
  walletBalancePaise: number;
};

export async function searchCustomersForPos(query: string, limit = 30): Promise<PosCustomerHit[]> {
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
    .where(and(eq(fyhCustomers.isActive, true), or(...conditions)))
    .orderBy(asc(fyhCustomers.fullName))
    .limit(limit);

  return rows;
}

export type QuickSaleCatalog = {
  services: Array<{
    id: string;
    name: string;
    code: string | null;
    category: string | null;
    description: string | null;
    pricePaise: number;
    gstBps: number;
  }>;
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
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

export async function loadQuickSaleCatalog(): Promise<QuickSaleCatalog> {
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
      .where(eq(fyhServices.isActive, true))
      .orderBy(asc(fyhServices.displayOrder), asc(fyhServices.name)),
    hairDb
      .select({
        id: fyhProducts.id,
        name: fyhProducts.name,
        sku: fyhProducts.sku,
        category: fyhProducts.category,
        description: fyhProducts.description,
        pricePaise: fyhProducts.sellingPricePaise,
        gstBps: fyhProducts.gstBps,
      })
      .from(fyhProducts)
      .where(and(eq(fyhProducts.isActive, true), eq(fyhProducts.isRetail, true)))
      .orderBy(asc(fyhProducts.name)),
    listPackagePlans().then((rows) =>
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        pricePaise: p.pricePaise,
        description: null as string | null,
      })),
    ),
    listMembershipPlans().then((rows) =>
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
      .where(eq(fyhStaff.isActive, true))
      .orderBy(asc(fyhStaff.fullName)),
  ]);

  return { services, products, packages, memberships, staff };
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
  opts?: {
    discountPaise?: number;
    walletRedeemPaise?: number;
    tipPaise?: number;
    roundOffPaise?: number;
  },
): Promise<QuickSaleTotalsPreview> {
  const { subtotalPaise, taxPaise } = sumCartLines(cartLines);
  const discountSubtotal = cartLines
    .filter((l) => l.kind === 'service' || l.kind === 'product')
    .reduce(
      (sum, l) => sum + Math.max(0, l.unitPricePaise * l.quantity - l.lineDiscountPaise),
      0,
    );
  const redemptions = await computeRedemptions(customerId, discountSubtotal, []);
  const membershipDiscountPaise = redemptions.membershipDiscountPaise;
  const walletRedeemPaise = Math.min(
    Math.max(0, opts?.walletRedeemPaise ?? 0),
    redemptions.availableWalletPaise,
  );
  const { grandTotalPaise } = computeGrandTotalFromParts({
    subtotalPaise,
    taxPaise,
    discountPaise: Math.max(0, opts?.discountPaise ?? 0),
    membershipDiscountPaise,
    packageRedeemPaise: 0,
    walletRedeemPaise,
    tipPaise: Math.max(0, opts?.tipPaise ?? 0),
    roundOffPaise: opts?.roundOffPaise ?? 0,
  });
  return {
    subtotalPaise,
    taxPaise,
    membershipDiscountPaise,
    grandTotalPaise,
    availableWalletPaise: redemptions.availableWalletPaise,
  };
}

export async function searchStaffForPos(query: string, limit = 20) {
  const q = query.trim();
  if (q.length < 1) return [];
  const pattern = `%${q}%`;
  return hairDb
    .select({ id: fyhStaff.id, fullName: fyhStaff.fullName, role: fyhStaff.role })
    .from(fyhStaff)
    .where(and(eq(fyhStaff.isActive, true), ilike(fyhStaff.fullName, pattern)))
    .orderBy(asc(fyhStaff.fullName))
    .limit(limit);
}

export async function getCustomerWalletBalance(customerId: string) {
  const [row] = await hairDb
    .select({ walletBalancePaise: fyhCustomers.walletBalancePaise })
    .from(fyhCustomers)
    .where(eq(fyhCustomers.id, customerId))
    .limit(1);
  return row?.walletBalancePaise ?? 0;
}
