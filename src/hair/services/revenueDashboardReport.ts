/**
 * FYHAIR Revenue Dashboard report — read-only aggregates from billing/ledger SSOT.
 *
 * Date semantics (all ranges are half-open `[from, to)` in UTC after salon TZ conversion):
 * - Sales, Net Contribution (COGS), Tips, Redemption, Invoices day-wise: invoice `paidAt`
 * - Actual Collection, Advances: ledger `createdAt` on tender `payment_received` debits
 * - Refunds: credit note `issuedAt`
 * - Expenses: `fyh_expenses.expense_date` (inclusive date strings)
 * - Dues: live current outstanding — ignores dashboard date range
 * - Staff Pay: payroll month containing `to` (salon calendar)
 */
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCreditNotes,
  fyhExpenses,
  fyhFinancialLedger,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhProducts,
  fyhServices,
} from '@/src/hair/db/schema';
import { isPackageRedemptionLineName } from '@/src/hair/domain/packages/availableServices';
import {
  FYH_EXPENSE_CATEGORY_LABELS,
  type FyhExpenseCategory,
} from '@/src/hair/lib/expenseCategories';
import { salonDayBounds, salonMonthStartUtc, zonedLocalToUtc } from '@/src/hair/lib/salonTime';
import { orgFilter, locationsInFilter } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { receivablesReport } from '@/src/hair/services/reportQueries';
import { getSalonSettings } from '@/src/hair/services/settings';
import type {
  RevenueDashboardLocationFilter,
  RevenueDashboardReport,
  RevenueDashboardReportInput,
  SalesBreakdown,
  TenderBreakdown,
} from '@/src/hair/services/revenueDashboardReportTypes';

export type { RevenueDashboardReport, RevenueDashboardReportInput } from '@/src/hair/services/revenueDashboardReportTypes';

export function computePreviousPeriod(from: Date, to: Date): { previousFrom: Date; previousTo: Date } {
  const durationMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime());
  const previousFrom = new Date(from.getTime() - durationMs);
  return { previousFrom, previousTo };
}

export function computeNetContributionPaise(grossSalesPaise: number, directCostPaise: number): number {
  return Math.max(0, grossSalesPaise - directCostPaise);
}

export function buildSalesBreakdown(metrics: Map<string, number>): SalesBreakdown {
  const service = metrics.get('service') ?? 0;
  const product = metrics.get('product') ?? 0;
  const pkg = metrics.get('package') ?? 0;
  const membership = metrics.get('membership') ?? 0;
  const giftCard = metrics.get('gift_card') ?? 0;
  const total = service + product + pkg + membership + giftCard;
  return {
    netServicePaise: service,
    packagePaise: pkg,
    productPaise: product,
    membershipPaise: membership,
    giftCardPaise: giftCard,
    totalPaise: total,
  };
}

export function emptyTenderBreakdown(): TenderBreakdown {
  return { cashPaise: 0, cardPaise: 0, upiPaise: 0, otherPaise: 0, totalPaise: 0 };
}

/** Map ledger account/method to dashboard tender buckets. */
export function accumulateTenderRow(
  breakdown: TenderBreakdown,
  account: string | null,
  method: string | null,
  amountPaise: number,
): TenderBreakdown {
  const out = { ...breakdown };
  const key = (method ?? account ?? 'other').toLowerCase();
  if (key === 'cash') out.cashPaise += amountPaise;
  else if (key === 'card') out.cardPaise += amountPaise;
  else if (key === 'upi') out.upiPaise += amountPaise;
  else out.otherPaise += amountPaise;
  out.totalPaise += amountPaise;
  return out;
}

function salesInvoiceWhere(
  from: Date,
  to: Date,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
) {
  return and(
    orgFilter(fyhInvoices.organizationId, ctx),
    locationsInFilter(fyhInvoices.locationId, ctx, locationIds),
    eq(fyhInvoices.status, 'paid'),
    gte(fyhInvoices.paidAt, from),
    lt(fyhInvoices.paidAt, to),
    ne(fyhInvoices.source, 'advance_payment'),
  );
}

async function aggregateSalesByMetric(
  from: Date,
  to: Date,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
): Promise<Map<string, number>> {
  const where = salesInvoiceWhere(from, to, ctx, locationIds);
  const rows = await hairDb
    .select({
      metric: fyhInvoiceLineAttributions.revenueMetric,
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(where)
    .groupBy(fyhInvoiceLineAttributions.revenueMetric);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.metric) map.set(r.metric, Number(r.total ?? 0));
  }
  return map;
}

async function aggregateDirectCostPaise(
  from: Date,
  to: Date,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
): Promise<number> {
  const where = salesInvoiceWhere(from, to, ctx, locationIds);
  const [row] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(
        case
          when ${fyhInvoiceLines.kind} = 'product' and ${fyhInvoiceLines.productId} is not null
            then ((${fyhProducts.costPricePaise})::numeric * ${fyhInvoiceLines.quantity})
          when ${fyhInvoiceLines.kind} = 'service' and ${fyhInvoiceLines.serviceId} is not null
            then ((${fyhServices.costPricePaise})::numeric * ${fyhInvoiceLines.quantity})
          else 0
        end
      ), 0)::bigint`,
    })
    .from(fyhInvoiceLines)
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhProducts, eq(fyhProducts.id, fyhInvoiceLines.productId))
    .leftJoin(fyhServices, eq(fyhServices.id, fyhInvoiceLines.serviceId))
    .where(where);

  return Math.max(0, Number(row?.total ?? 0));
}

async function aggregateTenderLedger(
  from: Date,
  to: Date,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
  mode: 'checkout' | 'advance',
): Promise<TenderBreakdown> {
  const sourcePredicate =
    mode === 'advance'
      ? eq(fyhInvoices.source, 'advance_payment')
      : ne(fyhInvoices.source, 'advance_payment');

  const rows = await hairDb
    .select({
      account: fyhFinancialLedger.account,
      method: fyhFinancialLedger.method,
      amountPaise: sql<number>`coalesce(sum(${fyhFinancialLedger.amountPaise}), 0)::bigint`,
    })
    .from(fyhFinancialLedger)
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhFinancialLedger.invoiceId))
    .where(
      and(
        orgFilter(fyhFinancialLedger.organizationId, ctx),
        orgFilter(fyhInvoices.organizationId, ctx),
        locationsInFilter(fyhInvoices.locationId, ctx, locationIds),
        eq(fyhFinancialLedger.kind, 'payment_received'),
        eq(fyhFinancialLedger.direction, 'debit'),
        sql`${fyhFinancialLedger.account} in ('cash', 'upi', 'card', 'bank')`,
        sourcePredicate,
        gte(fyhFinancialLedger.createdAt, from),
        lt(fyhFinancialLedger.createdAt, to),
      ),
    )
    .groupBy(fyhFinancialLedger.account, fyhFinancialLedger.method);

  let breakdown = emptyTenderBreakdown();
  for (const r of rows) {
    breakdown = accumulateTenderRow(
      breakdown,
      r.account,
      r.method,
      Number(r.amountPaise ?? 0),
    );
  }
  return breakdown;
}

async function aggregateRefundsPaise(
  from: Date,
  to: Date,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
): Promise<number> {
  const rows = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhCreditNotes.amountPaise}), 0)::bigint`,
    })
    .from(fyhCreditNotes)
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhCreditNotes.invoiceId))
    .where(
      and(
        orgFilter(fyhCreditNotes.organizationId, ctx),
        orgFilter(fyhInvoices.organizationId, ctx),
        locationsInFilter(fyhInvoices.locationId, ctx, locationIds),
        gte(fyhCreditNotes.issuedAt, from),
        lt(fyhCreditNotes.issuedAt, to),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

async function aggregateTipsPaise(
  from: Date,
  to: Date,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
): Promise<number> {
  const [row] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhInvoices.tipPaise}), 0)::bigint`,
    })
    .from(fyhInvoices)
    .where(salesInvoiceWhere(from, to, ctx, locationIds));
  return Number(row?.total ?? 0);
}

async function aggregateCurrentDuesPaise(
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
): Promise<number> {
  try {
    const rows = await receivablesReport(undefined, ctx);
    const total = rows.reduce((sum, r) => sum + r.balancePaise, 0);
    if (total > 0) return total;
  } catch {
    // invoice fallback
  }

  try {
    const [row] = await hairDb
      .select({
        total: sql<number>`coalesce(sum(${fyhInvoices.grandTotalPaise} - ${fyhInvoices.amountPaidPaise}), 0)::bigint`,
      })
      .from(fyhInvoices)
      .where(
        and(
          orgFilter(fyhInvoices.organizationId, ctx),
          locationsInFilter(fyhInvoices.locationId, ctx, locationIds),
          sql`${fyhInvoices.status} in ('unpaid', 'partial')`,
        ),
      );
    return Math.max(0, Number(row?.total ?? 0));
  } catch {
    return 0;
  }
}

async function aggregateRedemption(
  from: Date,
  to: Date,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
) {
  const where = salesInvoiceWhere(from, to, ctx, locationIds);
  const [inv] = await hairDb
    .select({
      packageRedeem: sql<number>`coalesce(sum(${fyhInvoices.packageRedemptionPaise}), 0)::bigint`,
      discount: sql<number>`coalesce(sum(${fyhInvoices.discountPaise}), 0)::bigint`,
    })
    .from(fyhInvoices)
    .where(where);

  const lineRows = await hairDb
    .select({
      nameSnapshot: fyhInvoiceLines.nameSnapshot,
      serviceId: fyhInvoiceLines.serviceId,
      unitPricePaise: fyhInvoiceLines.unitPricePaise,
      quantity: fyhInvoiceLines.quantity,
      pricePaise: fyhServices.pricePaise,
    })
    .from(fyhInvoiceLines)
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhServices, eq(fyhServices.id, fyhInvoiceLines.serviceId))
    .where(where);

  let netServicePaise = 0;
  for (const line of lineRows) {
    if (!isPackageRedemptionLineName(line.nameSnapshot)) continue;
    const qty = Number(line.quantity ?? 1);
    const fromCatalog =
      line.serviceId && line.pricePaise != null ? Number(line.pricePaise) * qty : 0;
    const fromLine = Number(line.unitPricePaise ?? 0) * qty;
    netServicePaise += fromCatalog > 0 ? fromCatalog : fromLine;
  }

  const discountPaise = Number(inv?.discount ?? 0);
  const packageRedeem = Number(inv?.packageRedeem ?? 0);
  return {
    netServicePaise,
    discountPaise,
    totalPaise: netServicePaise + discountPaise + packageRedeem,
  };
}

async function aggregateInvoicesDayWise(
  from: Date,
  to: Date,
  timezone: string,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
) {
  const rows = await hairDb
    .select({
      paidAt: fyhInvoices.paidAt,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      discountPaise: fyhInvoices.discountPaise,
      subtotalPaise: fyhInvoices.subtotalPaise,
    })
    .from(fyhInvoices)
    .where(salesInvoiceWhere(from, to, ctx, locationIds));

  const byDay = new Map<
    string,
    { invoiceAmountPaise: number; discountPaise: number; totalPaise: number; invoiceCount: number }
  >();

  for (const row of rows) {
    if (!row.paidAt) continue;
    const { dayKey } = salonDayBounds(timezone, row.paidAt);
    const bucket = byDay.get(dayKey) ?? {
      invoiceAmountPaise: 0,
      discountPaise: 0,
      totalPaise: 0,
      invoiceCount: 0,
    };
    bucket.invoiceAmountPaise += Number(row.subtotalPaise ?? 0);
    bucket.discountPaise += Number(row.discountPaise ?? 0);
    bucket.totalPaise += Number(row.grandTotalPaise ?? 0);
    bucket.invoiceCount += 1;
    byDay.set(dayKey, bucket);
  }

  const sortedKeys = [...byDay.keys()].sort();
  return sortedKeys.map((dayKey) => {
    const b = byDay.get(dayKey)!;
    const label = new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
    }).format(new Date(`${dayKey}T12:00:00Z`));
    return { dayKey, label, ...b };
  });
}

async function aggregateExpenses(
  from: Date,
  to: Date,
  timezone: string,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
) {
  const fromDay = salonDayBounds(timezone, from).dayKey;
  const toDay = salonDayBounds(timezone, new Date(to.getTime() - 1)).dayKey;

  const rows = await hairDb
    .select({
      category: fyhExpenses.category,
      total: sql<number>`coalesce(sum(${fyhExpenses.amountPaise}), 0)::bigint`,
    })
    .from(fyhExpenses)
    .where(
      and(
        orgFilter(fyhExpenses.organizationId, ctx),
        locationsInFilter(fyhExpenses.locationId, ctx, locationIds),
        gte(fyhExpenses.expenseDate, fromDay),
        sql`${fyhExpenses.expenseDate} <= ${toDay}`,
      ),
    )
    .groupBy(fyhExpenses.category);

  const out: RevenueDashboardReport['expenses'] = [];
  let expensesTotalPaise = 0;
  for (const r of rows) {
    const category = r.category as FyhExpenseCategory;
    const amountPaise = Number(r.total ?? 0);
    expensesTotalPaise += amountPaise;
    out.push({
      category,
      label: FYH_EXPENSE_CATEGORY_LABELS[category] ?? category,
      amountPaise,
    });
  }
  out.sort((a, b) => b.amountPaise - a.amountPaise);
  return { rows: out, expensesTotalPaise };
}

async function loadStaffPaySection(
  to: Date,
  timezone: string,
  ctx: TenantContext | null,
): Promise<RevenueDashboardReport['staffPay']> {
  const { dayKey } = salonDayBounds(timezone, new Date(to.getTime() - 1));
  const monthKey = dayKey.slice(0, 7);

  try {
    const { loadPayrollRunDetail } = await import('@/src/workforce/services/payroll');
    const detail = await loadPayrollRunDetail({
      monthKey,
      timezone,
      ctx,
      allowCreate: false,
      includePaymentDetails: false,
    });
    if (!detail.lines.length) {
      return {
        payrollMonthKey: monthKey,
        payrollPeriodLabel: monthKey,
        rows: [],
      };
    }
    return {
      payrollMonthKey: monthKey,
      payrollPeriodLabel: `${detail.periodStart} – ${detail.periodEnd}`,
      rows: detail.lines.map((line) => ({
        staffName: line.fullName,
        advanceSalaryPaise: null,
        incentivePaise: line.incentivePaise,
        salaryPaise: line.salaryPaise,
      })),
    };
  } catch {
    return { payrollMonthKey: monthKey, payrollPeriodLabel: null, rows: [] };
  }
}

/** Gross attributed sales in range excluding customer advances (for owner summary alignment). */
export async function salesGrossPaiseExcludingAdvances(
  from: Date,
  to: Date,
  ctx?: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter = 'all',
): Promise<number> {
  ctx = await resolveTenantContextForService(ctx);
  const metrics = await aggregateSalesByMetric(from, to, ctx, locationIds);
  return buildSalesBreakdown(metrics).totalPaise;
}

export function resolveDefaultReportRange(timezone: string): { from: Date; to: Date; fromDayKey: string; toDayKey: string } {
  const monthStart = salonMonthStartUtc(timezone);
  const { end, dayKey: toDayKey } = salonDayBounds(timezone);
  const fromDayKey = salonDayBounds(timezone, monthStart).dayKey;
  return { from: monthStart, to: end, fromDayKey, toDayKey };
}

export function parseReportDayRange(
  timezone: string,
  fromDayKey?: string | null,
  toDayKey?: string | null,
): { from: Date; to: Date } {
  const defaults = resolveDefaultReportRange(timezone);
  const fromKey = fromDayKey?.trim() || defaults.fromDayKey;
  const toKey = toDayKey?.trim() || defaults.toDayKey;
  const from = zonedLocalToUtc(`${fromKey}T00:00:00`, timezone);
  const toEnd = zonedLocalToUtc(`${toKey}T00:00:00`, timezone);
  const to = new Date(toEnd.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

export function parseLocationIdsParam(raw: string | null | undefined): RevenueDashboardLocationFilter {
  if (!raw?.trim() || raw.trim() === 'all') return 'all';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : 'all';
}

export async function getRevenueDashboardReport(
  input: RevenueDashboardReportInput,
  ctx?: TenantContext | null,
): Promise<RevenueDashboardReport> {
  ctx = await resolveTenantContextForService(ctx);
  const { from, to, timezone, locationIds, comparePreviousPeriod = true } = input;

  const [
    metrics,
    directCostPaise,
    actualCollection,
    advances,
    refundsTotal,
    tipsTotalPaise,
    duesCurrentOutstandingPaise,
    redemption,
    invoicesDayWise,
    expenseBlock,
    staffPay,
  ] = await Promise.all([
    aggregateSalesByMetric(from, to, ctx, locationIds),
    aggregateDirectCostPaise(from, to, ctx, locationIds),
    aggregateTenderLedger(from, to, ctx, locationIds, 'checkout'),
    aggregateTenderLedger(from, to, ctx, locationIds, 'advance'),
    aggregateRefundsPaise(from, to, ctx, locationIds),
    aggregateTipsPaise(from, to, ctx, locationIds),
    aggregateCurrentDuesPaise(ctx, locationIds),
    aggregateRedemption(from, to, ctx, locationIds),
    aggregateInvoicesDayWise(from, to, timezone, ctx, locationIds),
    aggregateExpenses(from, to, timezone, ctx, locationIds),
    loadStaffPaySection(to, timezone, ctx),
  ]);

  const sales = buildSalesBreakdown(metrics);
  const grossSalesPaise = sales.totalPaise;
  const netCollectionContributionPaise = computeNetContributionPaise(grossSalesPaise, directCostPaise);

  const refunds: TenderBreakdown = {
    ...emptyTenderBreakdown(),
    otherPaise: refundsTotal,
    totalPaise: refundsTotal,
  };

  let comparison: RevenueDashboardReport['comparison'] = null;
  if (comparePreviousPeriod) {
    const { previousFrom, previousTo } = computePreviousPeriod(from, to);
    const [prevMetrics, prevCost, prevCollection] = await Promise.all([
      aggregateSalesByMetric(previousFrom, previousTo, ctx, locationIds),
      aggregateDirectCostPaise(previousFrom, previousTo, ctx, locationIds),
      aggregateTenderLedger(previousFrom, previousTo, ctx, locationIds, 'checkout'),
    ]);
    const prevSales = buildSalesBreakdown(prevMetrics);
    const prevNet = computeNetContributionPaise(prevSales.totalPaise, prevCost);
    comparison = {
      previousFrom,
      previousTo,
      salesTotalDeltaPaise: sales.totalPaise - prevSales.totalPaise,
      netContributionDeltaPaise: netCollectionContributionPaise - prevNet,
      actualCollectionDeltaPaise: actualCollection.totalPaise - prevCollection.totalPaise,
    };
  }

  return {
    timezone,
    from,
    to,
    locationIds,
    sales,
    netContribution: {
      grossSalesPaise,
      directCostPaise,
      netCollectionContributionPaise,
      usesCurrentCatalogCost: true,
    },
    actualCollection,
    advances,
    refunds,
    tipsTotalPaise,
    duesCurrentOutstandingPaise,
    redemption,
    invoicesDayWise,
    staffPay,
    expenses: expenseBlock.rows,
    expensesTotalPaise: expenseBlock.expensesTotalPaise,
    comparison,
  };
}

export async function getRevenueDashboardReportForPage(
  opts: {
    fromDayKey?: string | null;
    toDayKey?: string | null;
    locationsParam?: string | null;
  },
  ctx?: TenantContext | null,
): Promise<RevenueDashboardReport> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const { from, to } = parseReportDayRange(timezone, opts.fromDayKey, opts.toDayKey);
  const locationIds = parseLocationIdsParam(opts.locationsParam);
  return getRevenueDashboardReport({ from, to, timezone, locationIds }, ctx);
}
