import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Health Brain Wave 2 cron — audit all brains, persist durable issues,
 * dispatch safe repairs, re-audit with score before/after.
 *
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

  try {
    const { runAllBrainIntegrityAudits } = await import('@/src/lib/health/healthBrain');
    const report = await runAllBrainIntegrityAudits({
      runSafeRepairs: true,
      persistIncidents: true,
      persistDurableIssues: true,
      repairTrigger: 'cron',
    });
    return Response.json({
      ok: report.pass,
      asOf: report.asOf,
      billingMonth: report.billingMonth,
      healthScore: report.healthScore,
      cards: report.cards,
      issueCount: report.issues.length,
      p0: report.issues.filter((i) => i.severity === 'P0').slice(0, 40),
      repairs: report.repairs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/health-brain-integrity]', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
