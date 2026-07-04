import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import {
  formatProductionDataConsistencyReport,
  runProductionDataConsistencyAudit,
  runProductionDataConsistencyRepair,
} from '@/src/services/productionDataConsistencyAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Production data audit + optional repair.
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Query:
 *   ?repair=1  — run idempotent repair after audit
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

  const repair = req.nextUrl.searchParams.get('repair') === '1';
  const before = await runProductionDataConsistencyAudit();
  const repairResult = repair ? await runProductionDataConsistencyRepair(before) : null;
  const after = repair ? await runProductionDataConsistencyAudit() : null;

  return Response.json({
    ok: true,
    markdown: formatProductionDataConsistencyReport(before),
    before,
    repair: repairResult,
    after,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
