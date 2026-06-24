import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  kycSubmissions,
  payments,
  siteAnalyticsEvents,
  sitePageViews,
  visitorSessions,
  type AnalyticsEventType,
} from '@/src/db/schema';
import {
  getBusinessMetricsSummary,
  getDailyCollectionTotals,
  getDepositCollectedByPgForBillingMonth,
  getDashboardStats,
} from '@/src/db/queries/admin';
import { getMonthlyRevenuePaise } from '@/src/services/dashboardMetrics';
import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { countPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { todayString } from '@/src/lib/dates';
import { VISITOR_SESSION_COOKIE, LIVE_VISITOR_WINDOW_MS } from '@/src/lib/analytics/constants';
import { parseDeviceType } from '@/src/lib/analytics/device';
import { pathToPageKey } from '@/src/lib/analytics/pageKeys';
import { classifyTrafficSource } from '@/src/lib/analytics/trafficSource';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VisitorContext = {
  sessionId: string;
  country: string | null;
  state: string | null;
  city: string | null;
};

function startOfDayUtc(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfWeekUtc(date = new Date()): Date {
  const d = startOfDayUtc(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function startOfMonthUtc(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function readGeoFromHeaders(): Promise<{
  country: string | null;
  state: string | null;
  city: string | null;
}> {
  const h = await headers();
  return {
    country: h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? null,
    state: h.get('x-vercel-ip-country-region') ?? null,
    city: h.get('x-vercel-ip-city') ?? null,
  };
}

export async function getVisitorSessionIdFromCookies(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(VISITOR_SESSION_COOKIE)?.value ?? null;
  if (!value || !UUID_RE.test(value)) return null;
  return value;
}

async function closePreviousPageView(sessionId: string): Promise<void> {
  const [prev] = await db
    .select({ id: sitePageViews.id, viewedAt: sitePageViews.viewedAt })
    .from(sitePageViews)
    .where(eq(sitePageViews.sessionId, sessionId))
    .orderBy(desc(sitePageViews.viewedAt))
    .limit(1);

  if (!prev || prev.viewedAt == null) return;

  const seconds = Math.max(
    0,
    Math.round((Date.now() - prev.viewedAt.getTime()) / 1000),
  );
  await db
    .update(sitePageViews)
    .set({ durationSeconds: seconds })
    .where(
      and(eq(sitePageViews.id, prev.id), sql`${sitePageViews.durationSeconds} IS NULL`),
    );
}

export async function ensureVisitorSession(input: {
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  userAgent?: string | null;
  customerId?: string | null;
  existingSessionId?: string | null;
}): Promise<VisitorContext> {
  const geo = await readGeoFromHeaders();
  const deviceType = parseDeviceType(input.userAgent);
  const trafficSource = classifyTrafficSource(input.referrer, input.utmSource);
  const now = new Date();

  const sessionId = input.existingSessionId;
  if (sessionId && UUID_RE.test(sessionId)) {
    const [existing] = await db
      .select({ id: visitorSessions.id })
      .from(visitorSessions)
      .where(eq(visitorSessions.id, sessionId))
      .limit(1);

    if (existing) {
      await db
        .update(visitorSessions)
        .set({
          lastSeenAt: now,
          customerId: input.customerId ?? undefined,
          country: geo.country ?? undefined,
          state: geo.state ?? undefined,
          city: geo.city ?? undefined,
        })
        .where(eq(visitorSessions.id, sessionId));
      return { sessionId, ...geo };
    }
  }

  const [created] = await db
    .insert(visitorSessions)
    .values({
      firstSeenAt: now,
      lastSeenAt: now,
      trafficSource,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      deviceType,
      country: geo.country,
      state: geo.state,
      city: geo.city,
      customerId: input.customerId ?? null,
    })
    .returning({ id: visitorSessions.id });

  return { sessionId: created!.id, ...geo };
}

export async function trackPageView(input: {
  sessionId: string;
  path: string;
}): Promise<void> {
  const pageKey = pathToPageKey(input.path);
  const now = new Date();

  await closePreviousPageView(input.sessionId);

  await db.insert(sitePageViews).values({
    sessionId: input.sessionId,
    path: input.path,
    pageKey,
    viewedAt: now,
  });

  await db
    .update(visitorSessions)
    .set({ lastSeenAt: now, currentPath: input.path })
    .where(eq(visitorSessions.id, input.sessionId));
}

export async function heartbeatSession(input: {
  sessionId: string;
  path: string;
}): Promise<void> {
  const now = new Date();
  await db
    .update(visitorSessions)
    .set({ lastSeenAt: now, currentPath: input.path })
    .where(eq(visitorSessions.id, input.sessionId));
}

/** Fails silently when analytics tables are not migrated yet. */
export async function trackAnalyticsEvent(input: {
  eventType: AnalyticsEventType;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sessionId =
      input.sessionId ?? (await getVisitorSessionIdFromCookies());

    await db.insert(siteAnalyticsEvents).values({
      sessionId: sessionId && UUID_RE.test(sessionId) ? sessionId : null,
      eventType: input.eventType,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Analytics must never break core flows.
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Admin queries
// ───────────────────────────────────────────────────────────────────────────

export type VisitorCountSummary = {
  today: number;
  week: number;
  month: number;
  allTime: number;
  /** Sessions first seen in each window (unique new visitors). */
  uniqueToday: number;
  uniqueWeek: number;
  uniqueMonth: number;
  uniqueAllTime: number;
  /** Sessions active in window but first seen before the window start. */
  returningToday: number;
  returningWeek: number;
  returningMonth: number;
  returningAllTime: number;
};

export async function getVisitorCountSummary(): Promise<VisitorCountSummary> {
  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const weekStart = startOfWeekUtc(now);
  const monthStart = startOfMonthUtc(now);

  const [row] = await db
    .select({
      today: sql<number>`count(*) FILTER (WHERE ${visitorSessions.firstSeenAt} >= ${todayStart})::int`,
      week: sql<number>`count(*) FILTER (WHERE ${visitorSessions.firstSeenAt} >= ${weekStart})::int`,
      month: sql<number>`count(*) FILTER (WHERE ${visitorSessions.firstSeenAt} >= ${monthStart})::int`,
      allTime: sql<number>`count(*)::int`,
      returningToday: sql<number>`count(*) FILTER (WHERE ${visitorSessions.lastSeenAt} >= ${todayStart} AND ${visitorSessions.firstSeenAt} < ${todayStart})::int`,
      returningWeek: sql<number>`count(*) FILTER (WHERE ${visitorSessions.lastSeenAt} >= ${weekStart} AND ${visitorSessions.firstSeenAt} < ${weekStart})::int`,
      returningMonth: sql<number>`count(*) FILTER (WHERE ${visitorSessions.lastSeenAt} >= ${monthStart} AND ${visitorSessions.firstSeenAt} < ${monthStart})::int`,
      returningAllTime: sql<number>`count(*) FILTER (WHERE ${visitorSessions.lastSeenAt} > ${visitorSessions.firstSeenAt} + interval '30 minutes')::int`,
    })
    .from(visitorSessions);

  const today = row?.today ?? 0;
  const week = row?.week ?? 0;
  const month = row?.month ?? 0;
  const allTime = row?.allTime ?? 0;

  return {
    today,
    week,
    month,
    allTime,
    uniqueToday: today,
    uniqueWeek: week,
    uniqueMonth: month,
    uniqueAllTime: allTime,
    returningToday: row?.returningToday ?? 0,
    returningWeek: row?.returningWeek ?? 0,
    returningMonth: row?.returningMonth ?? 0,
    returningAllTime: row?.returningAllTime ?? 0,
  };
}

export type AdminOverviewKpis = {
  totalVisitorsAllTime: number;
  activeTenants: number;
  bedsOccupied: number;
  bedsAvailable: number;
  pendingKyc: number;
  pendingPayments: number;
  todayRevenuePaise: number;
  monthlyRevenuePaise: number;
};

export async function getAdminOverviewKpis(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<AdminOverviewKpis> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const monthStart = new Date(`${billingMonth}T00:00:00.000Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const today = todayString();
  const now = new Date();

  const [visitorRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visitorSessions);

  const [tenantRow] = await db
    .select({ count: sql<number>`count(distinct ${bookings.customerId})::int` })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(
        eq(bedReservations.bookingId, bookings.id),
        eq(bedReservations.kind, 'primary'),
      ),
    )
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        eq(bedReservations.status, 'active'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    );

  const dash = await getDashboardStats();
  const bedsOccupied = dash.ok ? dash.data.occupiedBeds : 0;
  const bedsAvailable = dash.ok ? dash.data.availableBeds : 0;

  const [kycRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kycSubmissions)
    .where(eq(kycSubmissions.status, 'pending'));

  const pendingPayments = await countPendingPaymentReviews(session);

  const [todayRevResult, monthRevenue] = await Promise.all([
    getDailyCollectionTotals(),
    getMonthlyRevenuePaise(billingMonth),
  ]);

  const todayBreakdown = todayRevResult.ok
    ? todayRevResult.data
    : { rentPaise: 0, electricityPaise: 0, depositPaise: 0, totalPaise: 0 };

  return {
    totalVisitorsAllTime: visitorRow?.count ?? 0,
    activeTenants: tenantRow?.count ?? 0,
    bedsOccupied,
    bedsAvailable,
    pendingKyc: kycRow?.count ?? 0,
    pendingPayments,
    todayRevenuePaise: todayBreakdown.totalPaise,
    monthlyRevenuePaise: monthRevenue.totalPaise,
  };
}

export type LiveVisitorsSnapshot = {
  count: number;
  lastActivityAt: string | null;
  pages: Array<{ path: string; pageKey: string; count: number }>;
};

export async function getLiveVisitorsSnapshot(): Promise<LiveVisitorsSnapshot> {
  const cutoff = new Date(Date.now() - LIVE_VISITOR_WINDOW_MS);

  const liveRows = await db
    .select({
      path: visitorSessions.currentPath,
      lastSeenAt: visitorSessions.lastSeenAt,
    })
    .from(visitorSessions)
    .where(gte(visitorSessions.lastSeenAt, cutoff));

  const pageCounts = new Map<string, number>();
  let lastActivity: Date | null = null;

  for (const row of liveRows) {
    const path = row.path ?? '/';
    pageCounts.set(path, (pageCounts.get(path) ?? 0) + 1);
    if (!lastActivity || row.lastSeenAt > lastActivity) {
      lastActivity = row.lastSeenAt;
    }
  }

  const pages = [...pageCounts.entries()]
    .map(([path, count]) => ({ path, pageKey: pathToPageKey(path), count }))
    .sort((a, b) => b.count - a.count);

  return {
    count: liveRows.length,
    lastActivityAt: lastActivity?.toISOString() ?? null,
    pages,
  };
}

export type VisitorChartPoint = { label: string; visitors: number };

export async function getVisitorChartSeries(input: {
  granularity: 'daily' | 'weekly' | 'monthly';
  from: Date;
  to: Date;
}): Promise<VisitorChartPoint[]> {
  const truncUnit =
    input.granularity === 'daily'
      ? 'day'
      : input.granularity === 'weekly'
        ? 'week'
        : 'month';

  // Literal trunc unit — parameterized date_trunc($1, col) breaks GROUP BY in Postgres.
  const truncLiteral = sql.raw(`'${truncUnit}'`);
  const bucketExpr = sql`date_trunc(${truncLiteral}, ${visitorSessions.firstSeenAt})`;

  const rows = await db
    .select({
      bucket: sql<string>`${bucketExpr}::text`,
      visitors: sql<number>`count(*)::int`,
    })
    .from(visitorSessions)
    .where(
      and(
        gte(visitorSessions.firstSeenAt, input.from),
        lte(visitorSessions.firstSeenAt, input.to),
      ),
    )
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  return rows.map((r) => ({
    label: r.bucket,
    visitors: r.visitors,
  }));
}

export type PageAnalyticsRow = {
  pageKey: string;
  views: number;
  uniqueVisitors: number;
  avgDurationSeconds: number;
};

export async function getPageAnalytics(input: {
  from: Date;
  to: Date;
}): Promise<PageAnalyticsRow[]> {
  const rows = await db
    .select({
      pageKey: sitePageViews.pageKey,
      views: sql<number>`count(*)::int`,
      uniqueVisitors: sql<number>`count(distinct ${sitePageViews.sessionId})::int`,
      avgDurationSeconds: sql<number>`coalesce(round(avg(${sitePageViews.durationSeconds}) filter (where ${sitePageViews.durationSeconds} is not null)), 0)::int`,
    })
    .from(sitePageViews)
    .where(
      and(
        gte(sitePageViews.viewedAt, input.from),
        lte(sitePageViews.viewedAt, input.to),
      ),
    )
    .groupBy(sitePageViews.pageKey)
    .orderBy(sql`count(*) desc`);

  return rows;
}

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  conversionPct: number | null;
};

export async function getBookingFunnel(input: {
  from: Date;
  to: Date;
}): Promise<FunnelStep[]> {
  const [visitorRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visitorSessions)
    .where(
      and(
        gte(visitorSessions.firstSeenAt, input.from),
        lte(visitorSessions.firstSeenAt, input.to),
      ),
    );

  const eventRows = await db
    .select({
      eventType: siteAnalyticsEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(siteAnalyticsEvents)
    .where(
      and(
        gte(siteAnalyticsEvents.createdAt, input.from),
        lte(siteAnalyticsEvents.createdAt, input.to),
      ),
    )
    .groupBy(siteAnalyticsEvents.eventType);

  const eventMap = new Map(eventRows.map((r) => [r.eventType, r.count]));

  const steps = [
    { key: 'visitors', label: 'Visitors', count: visitorRow?.count ?? 0 },
    { key: 'pg_viewed', label: 'PG Viewed', count: eventMap.get('pg_viewed') ?? 0 },
    { key: 'room_viewed', label: 'Room Viewed', count: eventMap.get('room_viewed') ?? 0 },
    { key: 'bed_selected', label: 'Bed Selected', count: eventMap.get('bed_selected') ?? 0 },
    { key: 'booking_started', label: 'Booking Started', count: eventMap.get('booking_started') ?? 0 },
    {
      key: 'payment_uploaded',
      label: 'Payment Uploaded',
      count: eventMap.get('payment_uploaded') ?? 0,
    },
    { key: 'kyc_submitted', label: 'KYC Submitted', count: eventMap.get('kyc_submitted') ?? 0 },
    {
      key: 'booking_approved',
      label: 'Booking Approved',
      count: eventMap.get('booking_approved') ?? 0,
    },
    {
      key: 'check_in_completed',
      label: 'Check-In Completed',
      count: eventMap.get('check_in_completed') ?? 0,
    },
  ];

  return steps.map((step, i) => {
    const prev = i > 0 ? steps[i - 1]!.count : null;
    const conversionPct =
      prev && prev > 0 ? Math.round((step.count / prev) * 1000) / 10 : null;
    return { ...step, conversionPct };
  });
}

export type BreakdownRow = { label: string; count: number; pct: number };

export async function getTrafficSourceBreakdown(input: {
  from: Date;
  to: Date;
}): Promise<BreakdownRow[]> {
  const rows = await db
    .select({
      label: visitorSessions.trafficSource,
      count: sql<number>`count(*)::int`,
    })
    .from(visitorSessions)
    .where(
      and(
        gte(visitorSessions.firstSeenAt, input.from),
        lte(visitorSessions.firstSeenAt, input.to),
      ),
    )
    .groupBy(visitorSessions.trafficSource)
    .orderBy(sql`count(*) desc`);

  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  return rows.map((r) => ({
    label: r.label,
    count: r.count,
    pct: Math.round((r.count / total) * 1000) / 10,
  }));
}

export async function getDeviceBreakdown(input: {
  from: Date;
  to: Date;
}): Promise<BreakdownRow[]> {
  const rows = await db
    .select({
      label: visitorSessions.deviceType,
      count: sql<number>`count(*)::int`,
    })
    .from(visitorSessions)
    .where(
      and(
        gte(visitorSessions.firstSeenAt, input.from),
        lte(visitorSessions.firstSeenAt, input.to),
      ),
    )
    .groupBy(visitorSessions.deviceType)
    .orderBy(sql`count(*) desc`);

  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  return rows.map((r) => ({
    label: r.label,
    count: r.count,
    pct: Math.round((r.count / total) * 1000) / 10,
  }));
}

export type LocationBreakdown = {
  countries: BreakdownRow[];
  states: BreakdownRow[];
  cities: BreakdownRow[];
};

export async function getLocationBreakdown(input: {
  from: Date;
  to: Date;
}): Promise<LocationBreakdown> {
  async function topBy(
    column: typeof visitorSessions.country | typeof visitorSessions.state | typeof visitorSessions.city,
    limit = 5,
  ): Promise<BreakdownRow[]> {
    const rows = await db
      .select({
        label: column,
        count: sql<number>`count(*)::int`,
      })
      .from(visitorSessions)
      .where(
        and(
          gte(visitorSessions.firstSeenAt, input.from),
          lte(visitorSessions.firstSeenAt, input.to),
          sql`${column} IS NOT NULL`,
        ),
      )
      .groupBy(column)
      .orderBy(sql`count(*) desc`)
      .limit(limit);

    const total = rows.reduce((a, r) => a + r.count, 0) || 1;
    return rows.map((r) => ({
      label: r.label ?? 'Unknown',
      count: r.count,
      pct: Math.round((r.count / total) * 1000) / 10,
    }));
  }

  return {
    countries: await topBy(visitorSessions.country),
    states: await topBy(visitorSessions.state),
    cities: await topBy(visitorSessions.city),
  };
}
