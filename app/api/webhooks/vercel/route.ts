import { NextRequest } from 'next/server';
import { runDeployWatchdog } from '@/src/lib/deploy/watchdog';
import { withSelfHealing } from '@/src/lib/healing/withSelfHealing';
import { logger } from '@/src/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type VercelWebhookPayload = {
  type?: string;
  id?: string;
  payload?: {
    deployment?: { id?: string; url?: string; name?: string };
    project?: { id?: string };
    target?: string;
  };
};

function verifyWebhookSecret(req: NextRequest): boolean {
  const secret = process.env.VERCEL_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const header = req.headers.get('x-vercel-signature') ?? req.headers.get('authorization');
  return header === secret || header === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return Response.json({ ok: false, error: 'Invalid webhook secret' }, { status: 401 });
  }

  let body: VercelWebhookPayload;
  try {
    body = (await req.json()) as VercelWebhookPayload;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body.type ?? '';
  const deploymentId = body.payload?.deployment?.id;

  if (!deploymentId) {
    return Response.json({ ok: true, message: 'ignored — no deployment id' });
  }

  const successEvents = [
    'deployment.succeeded',
    'deployment.ready',
    'deployment.promoted',
  ];

  if (!successEvents.some((e) => eventType.includes(e) || eventType === e)) {
    return Response.json({ ok: true, message: `ignored event: ${eventType}` });
  }

  if (body.payload?.target && body.payload.target !== 'production') {
    return Response.json({ ok: true, message: 'ignored — not production' });
  }

  logger.info('vercel webhook: starting watchdog', { eventType, deploymentId });

  const result = await runDeployWatchdog(deploymentId);

  return Response.json({
    ok: true,
    watchdog: {
      deploymentId: result.deploymentId,
      stable: result.stable,
      warmupMs: result.warmupMs,
      summary: result.report.summary,
      rollback: result.rollback ?? null,
    },
  });
}

export const POST = withSelfHealing(handle, '/api/webhooks/vercel');
