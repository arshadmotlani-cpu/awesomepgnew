import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import {
  detectAutomationEvents,
  processQueuedAutomationActions,
} from '@/src/services/automationEngine';
import { processVacatingPastDueDaily } from '@/src/services/vacatingPastDue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PG Automation Engine — daily detect + send.
 * Reads existing invoice / vacating / KYC rows; does not run billing math.
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

  const detected = await detectAutomationEvents();
  const processed = await processQueuedAutomationActions(100);
  const vacatingPastDue = await processVacatingPastDueDaily();

  return Response.json({
    ok: true,
    detected,
    processed,
    actionItemsSynced: true,
    vacatingPastDue,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
