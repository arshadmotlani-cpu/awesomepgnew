import { createClient } from '@/src/db/client';
import {
  runPaymentProofRejectionSchemaChecks,
  summarizePaymentProofSchemaChecks,
} from '@/src/lib/db/paymentProofRejectionSchemaVerify';
import { env } from '@/src/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json({ ok: false, reason: 'CRON_SECRET is not configured on the server' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });
  }

  const { db, close } = createClient({ max: 1 });
  try {
    const checks = await runPaymentProofRejectionSchemaChecks(db);
    const summary = summarizePaymentProofSchemaChecks(checks);
    return Response.json(
      { ...summary, checks },
      { status: summary.ok ? 200 : 500 },
    );
  } finally {
    await close();
  }
}
