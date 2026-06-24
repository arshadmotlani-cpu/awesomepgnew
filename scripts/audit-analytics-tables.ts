#!/usr/bin/env npx tsx
import { sql } from 'drizzle-orm';
import { createClient } from '../src/db/client';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import { getVisitorCountSummary } from '../src/services/visitorAnalytics';

loadScriptEnv();

async function main() {
  const { db, close } = createClient();
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekStart = new Date(todayStart);
  const day = weekStart.getUTCDay();
  weekStart.setUTCDate(weekStart.getUTCDate() - (day === 0 ? 6 : day - 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const todayIso = todayStart.toISOString();
  const weekIso = weekStart.toISOString();
  const monthIso = monthStart.toISOString();

  try {
    const [vs, pv, ev, dashboard] = await Promise.all([
      db.execute<{ total: number; today: number; week: number; month: number }>(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE first_seen_at >= ${todayIso}::timestamptz)::int AS today,
          count(*) FILTER (WHERE first_seen_at >= ${weekIso}::timestamptz)::int AS week,
          count(*) FILTER (WHERE first_seen_at >= ${monthIso}::timestamptz)::int AS month
        FROM visitor_sessions
      `),
      db.execute<{ total: number; today: number; week: number; month: number }>(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE viewed_at >= ${todayIso}::timestamptz)::int AS today,
          count(*) FILTER (WHERE viewed_at >= ${weekIso}::timestamptz)::int AS week,
          count(*) FILTER (WHERE viewed_at >= ${monthIso}::timestamptz)::int AS month
        FROM site_page_views
      `),
      db.execute<{ total: number; today: number; week: number; month: number }>(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE created_at >= ${todayIso}::timestamptz)::int AS today,
          count(*) FILTER (WHERE created_at >= ${weekIso}::timestamptz)::int AS week,
          count(*) FILTER (WHERE created_at >= ${monthIso}::timestamptz)::int AS month
        FROM site_analytics_events
      `),
      getVisitorCountSummary(),
    ]);

    console.log(JSON.stringify({ visitor_sessions: vs[0], site_page_views: pv[0], site_analytics_events: ev[0], dashboard }, null, 2));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
