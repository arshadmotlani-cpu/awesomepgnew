import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Resident Brain integrity cron — audit + safe auto-repair.
 *
 * Cancels orphan draft/pending reserve bookings that block an active stay
 * when there is no live bed_reserve_hold. Surfaces remaining P0 findings
 * (missing rent, portal blocks) for System Health.
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
    const {
      runResidentBrainIntegrityAudit,
      repairOrphanReservesBlockingActiveStay,
    } = await import('@/src/lib/residents/residentBrainIntegrity');

    const before = await runResidentBrainIntegrityAudit();
    const repair = await repairOrphanReservesBlockingActiveStay();
    const after = await runResidentBrainIntegrityAudit();

    return Response.json({
      ok: after.pass,
      before: {
        pass: before.pass,
        counts: before.counts,
        findingCount: before.findings.length,
      },
      repair,
      after: {
        pass: after.pass,
        counts: after.counts,
        findingCount: after.findings.length,
        p0: after.findings.filter((f) => f.severity === 'P0').slice(0, 30),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/resident-brain-integrity]', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
