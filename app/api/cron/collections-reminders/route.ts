import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { runCollectionsRemindersJob } from '@/src/services/collectionReminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Collections reminder cron — generates wa.me delivery log entries for due policies.
 * Auth: Authorization: Bearer $CRON_SECRET
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
  const asOfOverride = url.searchParams.get('asOf');
  const pgId = url.searchParams.get('pgId') ?? undefined;

  try {
    const result = await runCollectionsRemindersJob({
      asOf: asOfOverride ?? undefined,
      pgId,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[cron/collections-reminders]', message, stack);
    return Response.json({ ok: false, reason: message, stack }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
