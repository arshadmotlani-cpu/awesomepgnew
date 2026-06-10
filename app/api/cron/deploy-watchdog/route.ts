import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { getLatestProductionDeployment } from '@/src/lib/deploy/vercelApi';
import { runDeployWatchdog } from '@/src/lib/deploy/watchdog';
import { withSelfHealing } from '@/src/lib/healing/withSelfHealing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json({ ok: false, reason: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });
  }

  const deploymentId =
    req.nextUrl.searchParams.get('deploymentId') ??
    (await getLatestProductionDeployment())?.id;

  if (!deploymentId) {
    return Response.json({ ok: false, reason: 'No deployment id available' }, { status: 400 });
  }

  const result = await runDeployWatchdog(deploymentId);

  return Response.json({
    ok: true,
    stable: result.stable,
    deploymentId: result.deploymentId,
    summary: result.report.summary,
    rollback: result.rollback ?? null,
  });
}

export const GET = withSelfHealing(handle, '/api/cron/deploy-watchdog');
export const POST = withSelfHealing(handle, '/api/cron/deploy-watchdog');
