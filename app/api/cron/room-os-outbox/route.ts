import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { drainRoomOsOutbox } from '@/src/roomOs/outbox/process';
import { getRoomOsOutboxMetrics } from '@/src/roomOs/outbox/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Room OS outbox projector drain — materializes property_os_index / work_queue_index.
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

  const batchSize = Number.parseInt(req.nextUrl.searchParams.get('batchSize') ?? '50', 10);
  const maxBatches = Number.parseInt(req.nextUrl.searchParams.get('maxBatches') ?? '20', 10);

  const beforeMetrics = await getRoomOsOutboxMetrics();
  const drain = await drainRoomOsOutbox({
    batchSize: Number.isFinite(batchSize) ? batchSize : 50,
    maxBatches: Number.isFinite(maxBatches) ? maxBatches : 20,
  });
  const afterMetrics = await getRoomOsOutboxMetrics();

  return Response.json({
    ok: true,
    processed: drain.processed,
    failed: drain.failed,
    retried: drain.retried,
    batches: drain.batches,
    pendingRemaining: drain.pendingRemaining,
    oldestPendingAgeMs: afterMetrics.oldestPendingAgeMs,
    deadLetter: afterMetrics.deadLetter,
    errors: drain.errors.slice(0, 20),
    before: beforeMetrics,
    after: afterMetrics,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
