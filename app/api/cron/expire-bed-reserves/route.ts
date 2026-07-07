import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { expireStaleBedReserves } from '@/src/services/bedReserve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Converts due bed reserves to monthly stays on check-in, and cancels
 * unpaid pending reserve holds whose payment window has lapsed.
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
  const result = await expireStaleBedReserves();
  return Response.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
