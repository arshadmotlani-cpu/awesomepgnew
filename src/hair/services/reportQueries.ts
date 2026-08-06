import { and, asc, desc, eq, gte, gt, lt, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerMemberships,
  fyhCustomerPackages,
  fyhCustomers,
  fyhFinancialLedger,
  fyhInvoices,
  fyhMembershipPlans,
  fyhPackagePlans,
  fyhProducts,
  fyhBrands,
} from '@/src/hair/db/schema';
import { walletBalanceFromLedger } from '@/src/hair/domain/ledger/plan';

export type ReportDateRange = { from: Date; to: Date };

export const DEFAULT_REPORT_PAGE_SIZE = 100;

export type ReportPageOptions = {
  limit?: number;
  offset?: number;
};

function pageLimit(opts?: ReportPageOptions): number {
  return Math.min(Math.max(opts?.limit ?? DEFAULT_REPORT_PAGE_SIZE, 1), 500);
}

function pageOffset(opts?: ReportPageOptions): number {
  return Math.max(opts?.offset ?? 0, 0);
}

export type PaymentMethodSplitRow = {
  method: string;
  amountPaise: number;
  entryCount: number;
};

export type DiscountReportRow = {
  invoiceNumber: string;
  customerName: string;
  paidAt: Date | null;
  discountPaise: number;
  membershipRedemptionPaise: number;
  packageRedemptionPaise: number;
  totalDiscountPaise: number;
};

export type GstDetailRow = {
  invoiceNumber: string;
  paidAt: Date | null;
  subtotalPaise: number;
  taxPaise: number;
  grandTotalPaise: number;
};

export type ReceivableRow = {
  customerId: string;
  customerName: string;
  phone: string;
  balancePaise: number;
};

export type AdvanceRow = {
  customerId: string;
  customerName: string;
  phone: string;
  amountPaise: number;
  reference: string | null;
  createdAt: Date;
};

export type WalletBalanceRow = {
  customerId: string;
  customerName: string;
  phone: string;
  balancePaise: number;
};

export type LoyaltyRow = {
  customerId: string;
  customerName: string;
  phone: string;
  rewardPoints: number;
  lifetimeSpendPaise: number;
  membership: string | null;
};

export type MembershipReportRow = {
  customerName: string;
  phone: string;
  planName: string;
  tier: string;
  startsOn: string;
  expiresOn: string;
};

export type PackageReportRow = {
  customerName: string;
  phone: string;
  planName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  expiresOn: string | null;
};

export type ProductCatalogRow = {
  name: string;
  productType: string;
  category: string | null;
  brand: string | null;
  sellingPricePaise: number;
  costPricePaise: number;
  stockQty: number;
  minStock: number;
  isActive: boolean;
};

const TENDER_ACCOUNTS = ['cash', 'upi', 'card'] as const;

/** Ledger-backed tender split for paid checkout movements in range. */
export async function paymentMethodSplit(range: ReportDateRange): Promise<PaymentMethodSplitRow[]> {
  const rows = await hairDb
    .select({
      method: fyhFinancialLedger.method,
      account: fyhFinancialLedger.account,
      amountPaise: sql<number>`coalesce(sum(${fyhFinancialLedger.amountPaise}), 0)::bigint`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(fyhFinancialLedger)
    .where(
      and(
        eq(fyhFinancialLedger.kind, 'payment_received'),
        eq(fyhFinancialLedger.direction, 'debit'),
        sql`${fyhFinancialLedger.account} in ('cash', 'upi', 'card')`,
        gte(fyhFinancialLedger.createdAt, range.from),
        lt(fyhFinancialLedger.createdAt, range.to),
      ),
    )
    .groupBy(fyhFinancialLedger.method, fyhFinancialLedger.account)
    .orderBy(desc(sql`sum(${fyhFinancialLedger.amountPaise})`));

  return rows.map((r) => ({
    method: (r.method ?? r.account ?? 'unknown').toUpperCase(),
    amountPaise: Number(r.amountPaise ?? 0),
    entryCount: Number(r.entryCount ?? 0),
  }));
}

/** Invoice snapshot discounts for paid bills in range. */
export async function discountsReport(
  range: ReportDateRange,
  page?: ReportPageOptions,
): Promise<DiscountReportRow[]> {
  const totalDiscount = sql<number>`(${fyhInvoices.discountPaise} + ${fyhInvoices.membershipRedemptionPaise} + ${fyhInvoices.packageRedemptionPaise})`;
  const rows = await hairDb
    .select({
      invoiceNumber: fyhInvoices.invoiceNumber,
      customerName: fyhCustomers.fullName,
      paidAt: fyhInvoices.paidAt,
      discountPaise: fyhInvoices.discountPaise,
      membershipRedemptionPaise: fyhInvoices.membershipRedemptionPaise,
      packageRedemptionPaise: fyhInvoices.packageRedemptionPaise,
      totalDiscountPaise: totalDiscount,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
        gt(totalDiscount, 0),
      ),
    )
    .orderBy(desc(fyhInvoices.paidAt))
    .limit(pageLimit(page))
    .offset(pageOffset(page));

  return rows.map((r) => ({
    invoiceNumber: r.invoiceNumber,
    customerName: r.customerName,
    paidAt: r.paidAt,
    discountPaise: Number(r.discountPaise ?? 0),
    membershipRedemptionPaise: Number(r.membershipRedemptionPaise ?? 0),
    packageRedemptionPaise: Number(r.packageRedemptionPaise ?? 0),
    totalDiscountPaise: Number(r.totalDiscountPaise ?? 0),
  }));
}

/** GST detail from paid invoice snapshots in range. */
export async function gstDetailReport(
  range: ReportDateRange,
  page?: ReportPageOptions,
): Promise<GstDetailRow[]> {
  const rows = await hairDb
    .select({
      invoiceNumber: fyhInvoices.invoiceNumber,
      paidAt: fyhInvoices.paidAt,
      subtotalPaise: fyhInvoices.subtotalPaise,
      taxPaise: fyhInvoices.taxPaise,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
    })
    .from(fyhInvoices)
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    )
    .orderBy(desc(fyhInvoices.paidAt))
    .limit(pageLimit(page))
    .offset(pageOffset(page));

  return rows.map((r) => ({
    invoiceNumber: r.invoiceNumber,
    paidAt: r.paidAt,
    subtotalPaise: Number(r.subtotalPaise ?? 0),
    taxPaise: Number(r.taxPaise ?? 0),
    grandTotalPaise: Number(r.grandTotalPaise ?? 0),
  }));
}

/** Open receivables derived from ledger per customer. */
export async function receivablesReport(page?: ReportPageOptions): Promise<ReceivableRow[]> {
  const balanceExpr = sql<number>`(
    coalesce(sum(case when ${fyhFinancialLedger.kind} = 'receivable_open' and ${fyhFinancialLedger.direction} = 'debit' then ${fyhFinancialLedger.amountPaise} else 0 end), 0)
    - coalesce(sum(case when ${fyhFinancialLedger.kind} in ('payment_received', 'receivable_settled') and ${fyhFinancialLedger.account} = 'accounts_receivable' and ${fyhFinancialLedger.direction} = 'credit' then ${fyhFinancialLedger.amountPaise} else 0 end), 0)
  )`;

  const rows = await hairDb
    .select({
      customerId: fyhFinancialLedger.customerId,
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      balancePaise: balanceExpr,
    })
    .from(fyhFinancialLedger)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhFinancialLedger.customerId))
    .groupBy(fyhFinancialLedger.customerId, fyhCustomers.fullName, fyhCustomers.phone)
    .having(sql`${balanceExpr} > 0`)
    .orderBy(desc(balanceExpr))
    .limit(pageLimit(page))
    .offset(pageOffset(page));

  return rows.map((r) => ({
    customerId: r.customerId,
    customerName: r.customerName,
    phone: r.phone,
    balancePaise: Number(r.balancePaise ?? 0),
  }));
}

/** Advance credits posted to customer wallet via ledger. */
export async function advancesReport(page?: ReportPageOptions): Promise<AdvanceRow[]> {
  const rows = await hairDb
    .select({
      customerId: fyhFinancialLedger.customerId,
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      amountPaise: fyhFinancialLedger.amountPaise,
      reference: fyhFinancialLedger.reference,
      createdAt: fyhFinancialLedger.createdAt,
    })
    .from(fyhFinancialLedger)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhFinancialLedger.customerId))
    .where(
      and(eq(fyhFinancialLedger.kind, 'advance_credit'), eq(fyhFinancialLedger.direction, 'credit')),
    )
    .orderBy(desc(fyhFinancialLedger.createdAt))
    .limit(pageLimit(page))
    .offset(pageOffset(page));

  return rows.map((r) => ({
    customerId: r.customerId,
    customerName: r.customerName,
    phone: r.phone,
    amountPaise: Number(r.amountPaise ?? 0),
    reference: r.reference,
    createdAt: r.createdAt,
  }));
}

/** Wallet balances derived from ledger entries (not cached column). */
export async function walletBalancesReport(page?: ReportPageOptions): Promise<WalletBalanceRow[]> {
  const rows = await hairDb
    .select({
      customerId: fyhFinancialLedger.customerId,
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      kind: fyhFinancialLedger.kind,
      direction: fyhFinancialLedger.direction,
      amountPaise: fyhFinancialLedger.amountPaise,
    })
    .from(fyhFinancialLedger)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhFinancialLedger.customerId))
    .where(
      or(
        eq(fyhFinancialLedger.kind, 'advance_credit'),
        eq(fyhFinancialLedger.kind, 'wallet_redemption'),
      ),
    );

  const byCustomer = new Map<
    string,
    { customerName: string; phone: string; entries: Array<{ kind: string; direction: string; amountPaise: number }> }
  >();

  for (const r of rows) {
    const existing = byCustomer.get(r.customerId) ?? {
      customerName: r.customerName,
      phone: r.phone,
      entries: [],
    };
    existing.entries.push({
      kind: r.kind,
      direction: r.direction,
      amountPaise: Number(r.amountPaise ?? 0),
    });
    byCustomer.set(r.customerId, existing);
  }

  const out: WalletBalanceRow[] = [];
  for (const [customerId, data] of byCustomer) {
    const balancePaise = walletBalanceFromLedger(data.entries);
    if (balancePaise > 0) {
      out.push({
        customerId,
        customerName: data.customerName,
        phone: data.phone,
        balancePaise,
      });
    }
  }
  out.sort((a, b) => b.balancePaise - a.balancePaise);
  const limit = pageLimit(page);
  const offset = pageOffset(page);
  return out.slice(offset, offset + limit);
}

/** Customers with reward points or active membership label. */
export async function loyaltyReport(page?: ReportPageOptions): Promise<LoyaltyRow[]> {
  const rows = await hairDb
    .select({
      customerId: fyhCustomers.id,
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      rewardPoints: fyhCustomers.rewardPoints,
      lifetimeSpendPaise: fyhCustomers.lifetimeSpendPaise,
      membership: fyhCustomers.membership,
    })
    .from(fyhCustomers)
    .where(
      and(
        eq(fyhCustomers.isActive, true),
        or(gt(fyhCustomers.rewardPoints, 0), sql`${fyhCustomers.membership} is not null`),
      ),
    )
    .orderBy(desc(fyhCustomers.rewardPoints), asc(fyhCustomers.fullName))
    .limit(pageLimit(page))
    .offset(pageOffset(page));

  return rows.map((r) => ({
    customerId: r.customerId,
    customerName: r.customerName,
    phone: r.phone,
    rewardPoints: Number(r.rewardPoints ?? 0),
    lifetimeSpendPaise: Number(r.lifetimeSpendPaise ?? 0),
    membership: r.membership,
  }));
}

/** Active customer memberships with plan details. */
export async function membershipsReport(page?: ReportPageOptions): Promise<MembershipReportRow[]> {
  const rows = await hairDb
    .select({
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      planName: fyhMembershipPlans.name,
      tier: fyhMembershipPlans.tier,
      startsOn: fyhCustomerMemberships.startsOn,
      expiresOn: fyhCustomerMemberships.expiresOn,
    })
    .from(fyhCustomerMemberships)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhCustomerMemberships.customerId))
    .innerJoin(fyhMembershipPlans, eq(fyhMembershipPlans.id, fyhCustomerMemberships.planId))
    .where(eq(fyhCustomerMemberships.isActive, true))
    .orderBy(asc(fyhCustomerMemberships.expiresOn))
    .limit(pageLimit(page))
    .offset(pageOffset(page));

  return rows.map((r) => ({
    customerName: r.customerName,
    phone: r.phone,
    planName: r.planName,
    tier: r.tier,
    startsOn: r.startsOn,
    expiresOn: r.expiresOn,
  }));
}

/** Active customer packages with remaining sessions. */
export async function packagesReport(page?: ReportPageOptions): Promise<PackageReportRow[]> {
  const rows = await hairDb
    .select({
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      planName: fyhPackagePlans.name,
      totalSessions: fyhCustomerPackages.totalSessions,
      usedSessions: fyhCustomerPackages.usedSessions,
      expiresOn: fyhCustomerPackages.expiresOn,
    })
    .from(fyhCustomerPackages)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhCustomerPackages.customerId))
    .innerJoin(fyhPackagePlans, eq(fyhPackagePlans.id, fyhCustomerPackages.planId))
    .where(eq(fyhCustomerPackages.isActive, true))
    .orderBy(asc(fyhCustomerPackages.expiresOn))
    .limit(pageLimit(page))
    .offset(pageOffset(page));

  return rows.map((r) => ({
    customerName: r.customerName,
    phone: r.phone,
    planName: r.planName,
    totalSessions: Number(r.totalSessions ?? 0),
    usedSessions: Number(r.usedSessions ?? 0),
    remainingSessions: Math.max(0, Number(r.totalSessions ?? 0) - Number(r.usedSessions ?? 0)),
    expiresOn: r.expiresOn,
  }));
}

function mapProductRow(p: {
  name: string;
  productType?: string | null;
  category?: string | null;
  brand?: string | null;
  sellingPricePaise: number;
  costPricePaise: number;
  stockQty: number;
  minStock?: number;
  isActive?: boolean;
}): ProductCatalogRow {
  return {
    name: p.name,
    productType: p.productType ?? 'retail',
    category: p.category ?? null,
    brand: p.brand ?? null,
    sellingPricePaise: Number(p.sellingPricePaise ?? 0),
    costPricePaise: Number(p.costPricePaise ?? 0),
    stockQty: Number(p.stockQty ?? 0),
    minStock: Number(p.minStock ?? 0),
    isActive: p.isActive !== false,
  };
}

async function queryProductCatalog(activeOnly: boolean): Promise<ProductCatalogRow[]> {
  const rows = await hairDb
    .select({
      product: fyhProducts,
      brandName: fyhBrands.name,
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .where(activeOnly ? eq(fyhProducts.isActive, true) : undefined)
    .orderBy(asc(fyhProducts.name))
    .limit(500);

  return rows.map(({ product: p, brandName }) =>
    mapProductRow({
      name: p.name,
      productType: p.productType,
      category: p.category,
      brand: brandName,
      sellingPricePaise: p.sellingPricePaise,
      costPricePaise: p.costPricePaise,
      stockQty: Number(p.stockQty ?? 0),
      minStock: Number(p.minStock ?? 0),
      isActive: p.isActive,
    }),
  );
}

/** Product catalog — delegates to stock service when report helpers exist. */
export async function productsReport(): Promise<ProductCatalogRow[]> {
  return queryProductCatalog(true);
}

/** Current stock levels — uses stock service summary when available. */
export async function stockReport(): Promise<ProductCatalogRow[]> {
  try {
    const { listStockSummary } = await import('@/src/hair/services/stock');
    const rows = await listStockSummary();
    return rows.map((r) =>
      mapProductRow({
        name: r.name,
        productType: r.productType,
        sellingPricePaise: r.sellingPricePaise,
        costPricePaise: r.costPricePaise,
        stockQty: Number(r.stockQty ?? 0),
        minStock: Number(r.minStock ?? 0),
        isActive: true,
      }),
    );
  } catch {
    return queryProductCatalog(true);
  }
}

/** Products at or below reorder level — uses stock service when available. */
export async function lowStockReport(): Promise<ProductCatalogRow[]> {
  try {
    const { listLowStockProducts } = await import('@/src/hair/services/stock');
    const rows = await listLowStockProducts();
    const brandMap = await import('@/src/hair/services/brands').then((m) =>
      m.getBrandNamesByIds([...new Set(rows.map((p) => p.brandId))]),
    );
    return rows.map((p) =>
      mapProductRow({
        name: p.name,
        productType: p.productType,
        category: p.category,
        brand: brandMap.get(p.brandId) ?? null,
        sellingPricePaise: p.sellingPricePaise,
        costPricePaise: p.costPricePaise,
        stockQty: Number(p.stockQty ?? 0),
        minStock: Number(p.minStock ?? 0),
        isActive: p.isActive,
      }),
    );
  } catch {
    // fallback below
  }

  const rows = await hairDb
    .select({
      product: fyhProducts,
      brandName: fyhBrands.name,
    })
    .from(fyhProducts)
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .where(
      and(
        eq(fyhProducts.isActive, true),
        sql`${fyhProducts.stockQty} <= ${fyhProducts.minStock}`,
        gt(fyhProducts.minStock, 0),
      ),
    )
    .orderBy(asc(fyhProducts.stockQty))
    .limit(500);

  return rows.map(({ product: p, brandName }) =>
    mapProductRow({
      name: p.name,
      productType: p.productType,
      category: p.category,
      brand: brandName,
      sellingPricePaise: p.sellingPricePaise,
      costPricePaise: p.costPricePaise,
      stockQty: Number(p.stockQty ?? 0),
      minStock: Number(p.minStock ?? 0),
      isActive: p.isActive,
    }),
  );
}

export { TENDER_ACCOUNTS };
