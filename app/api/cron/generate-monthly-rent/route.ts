import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import {
  generateRentInvoicesForMonth,
  markOverdueInvoices,
  expireRentInvoicesPastDue,
} from '@/src/services/rentInvoices';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Phase 5.5 — daily rent-billing cron.
 *
 * What it does (idempotent):
 *
 *   1. **On any day**: sweep `pending` invoices whose `due_date < today`
 *      and flip them to `overdue` so the dashboards reflect status
 *      without needing a live recompute on every read.
 *   2. **On the 1st of the month**: also generate invoices for the
 *      current calendar month. The `UNIQUE(booking_id, billing_month)`
 *      constraint plus `ON CONFLICT DO NOTHING` mean re-runs are
 *      no-ops, so this is safe to leave on a daily schedule too.
 *
 * Operator may also pass `?month=YYYY-MM-01` to force-generate for a
 * specific month (useful for backfilling).
 *
 * Auth: `CRON_SECRET` shared header. Same scheme as /release-holds.
 *
 * Scheduling (vercel.json):
 *   - Daily at 02:00 UTC (one tick covers both the overdue sweep AND
 *     the 1st-of-month generation).
 */
async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, reason: 'CRON_SECRET is not configured on the server' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const monthOverride = url.searchParams.get('month'); // YYYY-MM-01
  const force = url.searchParams.get('force') === '1';
  const today = new Date();

  // Daily check-in-aware generation + overdue sweep. force=1 backfills everyone.

  let generation: Awaited<ReturnType<typeof generateRentInvoicesForMonth>> | null = null;
  const month =
    monthOverride ??
    `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;

  if (monthOverride && force) {
    generation = await generateRentInvoicesForMonth({ billingMonth: month, forceAll: true });
  } else {
    generation = await generateRentInvoicesForMonth({ billingMonth: month, asOf: today });
  }

  const overdue = await markOverdueInvoices();
  const expired = await expireRentInvoicesPastDue();

  return Response.json({
    ok: true,
    today: today.toISOString(),
    ranGeneration: !!generation,
    generation,
    overdue,
    expired,
  });
}

export const GET = handle;
export const POST = handle;
