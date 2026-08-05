import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Electricity Brain integrity cron — audit only (never auto-creates bills).
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
    const url = new URL(req.url);
    const billingMonth = resolveBillingMonth(url.searchParams.get('month'));
    const { runElectricityReadingsWithoutBillsAudit } = await import(
      '@/src/lib/billing/electricityReadingsWithoutBills'
    );
    const report = await runElectricityReadingsWithoutBillsAudit({ billingMonth });

    return Response.json({
      ok: report.pass,
      alertMessage: report.alertMessage,
      billingMonth: report.billingMonth,
      findingCount: report.findings.length,
      findings: report.findings.slice(0, 40),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/electricity-readings-without-bills]', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
