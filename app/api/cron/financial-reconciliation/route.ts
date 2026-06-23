import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { runDailyFinancialReconciliation } from '@/src/services/financialReconciliation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  const result = await runDailyFinancialReconciliation();
  return Response.json(result);
}

export const GET = handle;
export const POST = handle;
