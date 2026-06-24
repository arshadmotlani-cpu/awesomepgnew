#!/usr/bin/env npx tsx
/**
 * P0 analytics pipeline verification — track API → DB → dashboard counts.
 *
 *   npx tsx scripts/verify-analytics-pipeline.ts
 *   npx tsx scripts/verify-analytics-pipeline.ts --base https://www.awesomepg.in
 */
import { sql } from 'drizzle-orm';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import { createClient } from '../src/db/client';
import { describeDatabaseTarget, isStubDatabaseUrl } from '../src/lib/db/stubDatabaseUrl';
import { getVisitorCountSummary } from '../src/services/visitorAnalytics';
import { ensureVisitorSession, trackPageView } from '../src/services/visitorAnalytics';

loadScriptEnv();

const VERIFY_UA = 'AwesomePG-Analytics-Verify/1.0';
const baseUrl = (() => {
  const idx = process.argv.indexOf('--base');
  return (idx >= 0 ? process.argv[idx + 1] : process.env.ANALYTICS_VERIFY_BASE_URL) ??
    'https://www.awesomepg.in';
})();

async function tableCounts(db: ReturnType<typeof createClient>['db']) {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayIso = todayStart.toISOString();

  const [sessions, pageViews, events] = await Promise.all([
    db.execute<{ total: number; today: number }>(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE first_seen_at >= ${todayIso}::timestamptz)::int AS today
      FROM visitor_sessions
    `),
    db.execute<{ total: number; today: number }>(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE viewed_at >= ${todayIso}::timestamptz)::int AS today
      FROM site_page_views
    `),
    db.execute<{ total: number; today: number }>(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE created_at >= ${todayIso}::timestamptz)::int AS today
      FROM site_analytics_events
    `),
  ]);

  return {
    visitor_sessions: sessions[0],
    site_page_views: pageViews[0],
    site_analytics_events: events[0],
  };
}

async function trackViaApi(path: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const res = await fetch(`${baseUrl}/api/analytics/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': VERIFY_UA,
    },
    body: JSON.stringify({ path, referrer: 'https://verify.local/' }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sessionId?: string;
    error?: string;
    skipped?: boolean;
  };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error ?? `HTTP ${res.status}` };
  }
  if (json.skipped) {
    return { ok: false, error: 'track skipped (bot/path filter)' };
  }
  return { ok: true, sessionId: json.sessionId };
}

async function trackDirectDb(path: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  try {
    const ctx = await ensureVisitorSession({
      userAgent: VERIFY_UA,
      referrer: 'https://verify.local/',
    });
    await trackPageView({ sessionId: ctx.sessionId, path });
    return { ok: true, sessionId: ctx.sessionId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function printWidgetTable(
  dashboard: Awaited<ReturnType<typeof getVisitorCountSummary>>,
) {
  console.log('\nDashboard widget queries:');
  console.log('─'.repeat(90));
  const rows: Array<{ widget: string; query: string; result: number }> = [
    {
      widget: 'Website Visitors',
      query: 'getVisitorCountSummary().allTime → COUNT(visitor_sessions)',
      result: dashboard.allTime,
    },
    {
      widget: 'Visitors Today',
      query: 'getVisitorCountSummary().today → first_seen_at >= startOfDayUtc',
      result: dashboard.today,
    },
    {
      widget: 'Visitors This Week',
      query: 'getVisitorCountSummary().week → first_seen_at >= startOfWeekUtc',
      result: dashboard.week,
    },
    {
      widget: 'Visitors This Month',
      query: 'getVisitorCountSummary().month → first_seen_at >= startOfMonthUtc',
      result: dashboard.month,
    },
  ];
  for (const row of rows) {
    console.log(`${row.widget.padEnd(24)} ${String(row.result).padStart(6)}  ${row.query}`);
  }
}

async function main() {
  const { db, close } = createClient();

  try {
    console.log('═'.repeat(60));
    console.log('P0 ANALYTICS PIPELINE VERIFICATION');
    console.log('═'.repeat(60));
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Database target: ${describeDatabaseTarget()}`);
    const stubDb = isStubDatabaseUrl();
    if (stubDb) {
      console.log(
        'Note: local/stub DATABASE_URL — DB delta checks use direct insert; production API writes the live cluster.',
      );
    }

    let dashboardOk = false;
    try {
      await getVisitorCountSummary();
      dashboardOk = true;
    } catch (err) {
      console.error('FAIL: getVisitorCountSummary threw', err);
      process.exitCode = 1;
      return;
    }

    const beforeCounts = stubDb ? null : await tableCounts(db);
    const beforeDashboard = await getVisitorCountSummary();

    if (beforeCounts) {
      console.log('\nBefore test visit:');
      console.log(JSON.stringify({ db: beforeCounts, dashboard: beforeDashboard }, null, 2));
    } else {
      console.log('\nBefore test visit (dashboard only):');
      console.log(JSON.stringify({ dashboard: beforeDashboard }, null, 2));
    }
    printWidgetTable(beforeDashboard);

    const testPath = `/verify-analytics-${Date.now()}`;
    console.log(`\nRecording test visit → ${testPath}`);

    console.log('  (1) Production track API…');
    const apiTracked = await trackViaApi(testPath);
    if (!apiTracked.ok) {
      console.error(`FAIL: production track API — ${apiTracked.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`      sessionId: ${apiTracked.sessionId}`);

    let directTracked: { ok: boolean; sessionId?: string; error?: string } | null = null;
    if (!stubDb) {
      console.log('  (2) Direct DB insert…');
      directTracked = await trackDirectDb(`${testPath}-direct`);
      if (!directTracked.ok) {
        console.error(`FAIL: direct DB track — ${directTracked.error}`);
        process.exitCode = 1;
        return;
      }
      console.log(`      sessionId: ${directTracked.sessionId}`);
    }

    const afterCounts = stubDb ? null : await tableCounts(db);
    const afterDashboard = await getVisitorCountSummary();

    if (afterCounts) {
      console.log('\nAfter test visit:');
      console.log(JSON.stringify({ db: afterCounts, dashboard: afterDashboard }, null, 2));
    } else {
      console.log('\nAfter test visit (dashboard only):');
      console.log(JSON.stringify({ dashboard: afterDashboard }, null, 2));
    }
    printWidgetTable(afterDashboard);

    const allTimeDelta = afterDashboard.allTime - beforeDashboard.allTime;
    const todayDelta = afterDashboard.today - beforeDashboard.today;

    console.log('\nDeltas:');
    if (afterCounts && beforeCounts) {
      const sessionDelta =
        (afterCounts.visitor_sessions?.total ?? 0) - (beforeCounts.visitor_sessions?.total ?? 0);
      const pvDelta =
        (afterCounts.site_page_views?.total ?? 0) - (beforeCounts.site_page_views?.total ?? 0);
      console.log(`  visitor_sessions: +${sessionDelta}`);
      console.log(`  site_page_views:  +${pvDelta}`);
    }
    console.log(`  dashboard allTime: +${allTimeDelta}`);
    console.log(`  dashboard today:   +${todayDelta}`);

    const pass =
      dashboardOk &&
      apiTracked.ok &&
      (stubDb || (allTimeDelta >= 1 && afterDashboard.allTime === (afterCounts?.visitor_sessions?.total ?? 0)));

    if (!pass) {
      console.log('\nOVERALL: FAIL — pipeline or dashboard mismatch');
      process.exitCode = 1;
      return;
    }

    console.log('\nOVERALL: PASS');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
