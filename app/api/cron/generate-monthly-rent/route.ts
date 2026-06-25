import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { runDailyRentBillingJob } from '@/src/services/billingScheduler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Daily rent billing — runs at 00:00 IST (18:30 UTC).
 * Anniversary-based generation + overdue sweep.
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
  const asOfOverride = url.searchParams.get('asOf'); // YYYY-MM-DD IST

  const result = await runDailyRentBillingJob({
    asOfIst: asOfOverride ?? undefined,
    triggeredBy: url.searchParams.get('retry') === '1' ? 'admin_retry' : 'system',
  });

  return Response.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
