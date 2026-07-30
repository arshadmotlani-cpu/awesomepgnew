import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhFinancialLedger, fyhInvoices } from '@/src/hair/db/schema';
import { salonDayBounds, salonDayKeyOffset } from '@/src/hair/lib/salonTime';
import {
  paymentMethodSplit,
  receivablesReport,
  walletBalancesReport,
  type PaymentMethodSplitRow,
} from '@/src/hair/services/reportQueries';
import {
  paidRevenueBetween,
  staffRevenueBetween,
  topProductsBetween,
  topServicesBetween,
} from '@/src/hair/services/reports';
import {
  getDailyClosingOpeningFloatPaise,
  getSalonSettings,
} from '@/src/hair/services/settings';

export type CollectionsByMethod = {
  cash: number;
  upi: number;
  card: number;
};

export type TopRevenueItem = {
  id: string;
  name: string;
  revenuePaise: number;
};

export type DailyRevenuePoint = {
  dayKey: string;
  revenuePaise: number;
};

export type CollectionsVsSales = {
  collectionsTodayPaise: number;
  salesTodayPaise: number;
  variancePaise: number;
};

export type FinancialDashboardSnapshot = {
  timezone: string;
  todaySalesCount: number;
  todayRevenuePaise: number;
  todayCollectionsByMethod: CollectionsByMethod;
  outstandingDuePaise: number;
  advanceLiabilityPaise: number;
  topServicesToday: TopRevenueItem[];
  topProductsToday: TopRevenueItem[];
  topStaffToday: TopRevenueItem[];
  monthlyTrend: DailyRevenuePoint[];
  collectionsVsSales: CollectionsVsSales;
};

export type DailyClosingSnapshot = {
  timezone: string;
  dayKey: string;
  openingFloatPaise: number;
  collectionsByMethod: CollectionsByMethod;
  totalCollectionsPaise: number;
  dueCollectedPaise: number;
  advanceIssuedPaise: number;
  expectedCashDrawerPaise: number;
};

const EMPTY_COLLECTIONS: CollectionsByMethod = { cash: 0, upi: 0, card: 0 };

/** Normalize ledger payment split rows into cash/upi/card buckets. */
export function collectionsFromPaymentSplit(rows: PaymentMethodSplitRow[]): CollectionsByMethod {
  const out: CollectionsByMethod = { ...EMPTY_COLLECTIONS };
  for (const row of rows) {
    const key = row.method.toLowerCase();
    if (key === 'cash' || key === 'upi' || key === 'card') {
      out[key] += row.amountPaise;
    }
  }
  return out;
}

export function sumCollections(collections: CollectionsByMethod): number {
  return collections.cash + collections.upi + collections.card;
}

/** Build a 30-day revenue series with zero-filled gaps. */
export function buildMonthlyTrend(
  dayKeys: string[],
  revenueByDay: Map<string, number>,
): DailyRevenuePoint[] {
  return dayKeys.map((dayKey) => ({
    dayKey,
    revenuePaise: revenueByDay.get(dayKey) ?? 0,
  }));
}

export function lastNDayKeys(endDayKey: string, n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    keys.push(salonDayKeyOffset(endDayKey, -i));
  }
  return keys;
}

export function collectionsVsSalesFromParts(
  collectionsTodayPaise: number,
  salesTodayPaise: number,
): CollectionsVsSales {
  return {
    collectionsTodayPaise,
    salesTodayPaise,
    variancePaise: collectionsTodayPaise - salesTodayPaise,
  };
}

async function aggregateOutstandingDuePaise(): Promise<number> {
  try {
    const rows = await receivablesReport();
    const total = rows.reduce((sum, r) => sum + r.balancePaise, 0);
    if (total > 0) return total;
  } catch {
    // fall through to invoice fallback
  }

  try {
    const [row] = await hairDb
      .select({
        total: sql<number>`coalesce(sum(${fyhInvoices.grandTotalPaise} - ${fyhInvoices.amountPaidPaise}), 0)::bigint`,
      })
      .from(fyhInvoices)
      .where(sql`${fyhInvoices.status} in ('unpaid', 'partial')`);
    return Math.max(0, Number(row?.total ?? 0));
  } catch {
    return 0;
  }
}

async function aggregateAdvanceLiabilityPaise(): Promise<number> {
  try {
    const rows = await walletBalancesReport();
    return rows.reduce((sum, r) => sum + r.balancePaise, 0);
  } catch {
    try {
      const [row] = await hairDb
        .select({
          total: sql<number>`coalesce(sum(case when ${fyhFinancialLedger.kind} = 'advance_credit' and ${fyhFinancialLedger.direction} = 'credit' then ${fyhFinancialLedger.amountPaise} when ${fyhFinancialLedger.kind} = 'wallet_redemption' and ${fyhFinancialLedger.direction} = 'debit' then -${fyhFinancialLedger.amountPaise} else 0 end), 0)::bigint`,
        })
        .from(fyhFinancialLedger);
      return Math.max(0, Number(row?.total ?? 0));
    } catch {
      return 0;
    }
  }
}

async function monthlyRevenueTrend(timezone: string, endDayKey: string): Promise<DailyRevenuePoint[]> {
  const dayKeys = lastNDayKeys(endDayKey, 30);
  const rangeStart = salonDayBounds(timezone, new Date(`${dayKeys[0]}T12:00:00Z`)).start;
  const rangeEnd = salonDayBounds(timezone, new Date(`${endDayKey}T12:00:00Z`)).end;

  const revenueByDay = new Map<string, number>();
  for (const key of dayKeys) revenueByDay.set(key, 0);

  try {
    const rows = await hairDb
      .select({
        paidAt: fyhInvoices.paidAt,
        total: fyhInvoices.grandTotalPaise,
      })
      .from(fyhInvoices)
      .where(
        and(
          eq(fyhInvoices.status, 'paid'),
          gte(fyhInvoices.paidAt, rangeStart),
          lt(fyhInvoices.paidAt, rangeEnd),
        ),
      );

    for (const row of rows) {
      if (!row.paidAt) continue;
      const { dayKey } = salonDayBounds(timezone, row.paidAt);
      revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + Number(row.total ?? 0));
    }
  } catch {
    // return zero-filled series
  }

  return buildMonthlyTrend(dayKeys, revenueByDay);
}

async function dueCollectedBetween(from: Date, to: Date): Promise<number> {
  try {
    const [settled] = await hairDb
      .select({
        total: sql<number>`coalesce(sum(${fyhFinancialLedger.amountPaise}), 0)::bigint`,
      })
      .from(fyhFinancialLedger)
      .where(
        and(
          eq(fyhFinancialLedger.kind, 'receivable_settled'),
          gte(fyhFinancialLedger.createdAt, from),
          lt(fyhFinancialLedger.createdAt, to),
        ),
      );
    const settledTotal = Number(settled?.total ?? 0);
    if (settledTotal > 0) return settledTotal;
  } catch {
    // fallback below
  }

  try {
    const [row] = await hairDb
      .select({
        total: sql<number>`coalesce(sum(${fyhFinancialLedger.amountPaise}), 0)::bigint`,
      })
      .from(fyhFinancialLedger)
      .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhFinancialLedger.invoiceId))
      .where(
        and(
          eq(fyhFinancialLedger.kind, 'payment_received'),
          eq(fyhFinancialLedger.account, 'accounts_receivable'),
          eq(fyhFinancialLedger.direction, 'credit'),
          lt(fyhInvoices.createdAt, from),
          gte(fyhFinancialLedger.createdAt, from),
          lt(fyhFinancialLedger.createdAt, to),
        ),
      );
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

async function advanceIssuedBetween(from: Date, to: Date): Promise<number> {
  try {
    const [row] = await hairDb
      .select({
        total: sql<number>`coalesce(sum(${fyhFinancialLedger.amountPaise}), 0)::bigint`,
      })
      .from(fyhFinancialLedger)
      .where(
        and(
          eq(fyhFinancialLedger.kind, 'advance_credit'),
          eq(fyhFinancialLedger.direction, 'credit'),
          gte(fyhFinancialLedger.createdAt, from),
          lt(fyhFinancialLedger.createdAt, to),
        ),
      );
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

export async function getFinancialDashboardSnapshot(): Promise<FinancialDashboardSnapshot> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const { start, end, dayKey } = salonDayBounds(timezone);
  const range = { from: start, to: end };

  let todaySalesCount = 0;
  let todayRevenuePaise = 0;
  let todayCollectionsByMethod: CollectionsByMethod = { ...EMPTY_COLLECTIONS };
  let outstandingDuePaise = 0;
  let advanceLiabilityPaise = 0;
  let topServicesToday: TopRevenueItem[] = [];
  let topProductsToday: TopRevenueItem[] = [];
  let topStaffToday: TopRevenueItem[] = [];
  let monthlyTrend: DailyRevenuePoint[] = lastNDayKeys(dayKey, 30).map((k) => ({
    dayKey: k,
    revenuePaise: 0,
  }));

  try {
    const today = await paidRevenueBetween(start, end);
    todaySalesCount = today.invoiceCount;
    todayRevenuePaise = today.revenuePaise;
  } catch {
    // keep zeros
  }

  try {
    const split = await paymentMethodSplit(range);
    todayCollectionsByMethod = collectionsFromPaymentSplit(split);
  } catch {
    todayCollectionsByMethod = { ...EMPTY_COLLECTIONS };
  }

  try {
    outstandingDuePaise = await aggregateOutstandingDuePaise();
  } catch {
    outstandingDuePaise = 0;
  }

  try {
    advanceLiabilityPaise = await aggregateAdvanceLiabilityPaise();
  } catch {
    advanceLiabilityPaise = 0;
  }

  try {
    const [services, products, staff] = await Promise.all([
      topServicesBetween(start, end, 5),
      topProductsBetween(start, end, 5),
      staffRevenueBetween(start, end, 5),
    ]);
    topServicesToday = services.map((s) => ({
      id: s.serviceId,
      name: s.name,
      revenuePaise: s.revenuePaise,
    }));
    topProductsToday = products.map((p) => ({
      id: p.productId,
      name: p.name,
      revenuePaise: p.revenuePaise,
    }));
    topStaffToday = staff.map((s) => ({
      id: s.staffId,
      name: s.name,
      revenuePaise: s.revenuePaise,
    }));
  } catch {
    topServicesToday = [];
    topProductsToday = [];
    topStaffToday = [];
  }

  try {
    monthlyTrend = await monthlyRevenueTrend(timezone, dayKey);
  } catch {
    monthlyTrend = lastNDayKeys(dayKey, 30).map((k) => ({ dayKey: k, revenuePaise: 0 }));
  }

  const collectionsTodayPaise = sumCollections(todayCollectionsByMethod);

  return {
    timezone,
    todaySalesCount,
    todayRevenuePaise,
    todayCollectionsByMethod,
    outstandingDuePaise,
    advanceLiabilityPaise,
    topServicesToday,
    topProductsToday,
    topStaffToday,
    monthlyTrend,
    collectionsVsSales: collectionsVsSalesFromParts(collectionsTodayPaise, todayRevenuePaise),
  };
}

export async function getDailyClosingSnapshot(): Promise<DailyClosingSnapshot> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const { start, end, dayKey } = salonDayBounds(timezone);
  const range = { from: start, to: end };
  const openingFloatPaise = getDailyClosingOpeningFloatPaise(settings);

  let collectionsByMethod: CollectionsByMethod = { ...EMPTY_COLLECTIONS };
  let dueCollectedPaise = 0;
  let advanceIssuedPaise = 0;

  try {
    collectionsByMethod = collectionsFromPaymentSplit(await paymentMethodSplit(range));
  } catch {
    collectionsByMethod = { ...EMPTY_COLLECTIONS };
  }

  try {
    dueCollectedPaise = await dueCollectedBetween(start, end);
  } catch {
    dueCollectedPaise = 0;
  }

  try {
    advanceIssuedPaise = await advanceIssuedBetween(start, end);
  } catch {
    advanceIssuedPaise = 0;
  }

  const totalCollectionsPaise = sumCollections(collectionsByMethod);
  const expectedCashDrawerPaise = openingFloatPaise + collectionsByMethod.cash;

  return {
    timezone,
    dayKey,
    openingFloatPaise,
    collectionsByMethod,
    totalCollectionsPaise,
    dueCollectedPaise,
    advanceIssuedPaise,
    expectedCashDrawerPaise,
  };
}
