import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { processOwnerOsEventInbox } from '@/src/owner/events/consumers';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Owner OS event inbox drain — ack-only processor (Phase 4).
 * Auth: Authorization: Bearer $CRON_SECRET
 */
async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json({ ok: false, reason: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!hasOwnerDatabaseUrl()) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: 'OWNER_DATABASE_URL not configured',
      at: new Date().toISOString(),
    });
  }

  const limit = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
  const result = await processOwnerOsEventInbox(Number.isFinite(limit) ? limit : 50);

  return Response.json({
    ok: true,
    processed: result.processed,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
