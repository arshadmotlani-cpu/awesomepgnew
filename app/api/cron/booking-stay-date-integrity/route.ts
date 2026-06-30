import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import {
  formatBookingStayDateReportMarkdown,
  repairBookingStayDateIntegrity,
} from '@/src/services/bookingStayDateIntegrity';

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

  const execute = req.nextUrl.searchParams.get('execute') === 'true';
  const report = await repairBookingStayDateIntegrity({ execute });

  return Response.json({
    ok: report.issueCount === 0 || (execute && report.repairedCount > 0),
    execute,
    summary: {
      totalActiveBookings: report.totalActiveBookings,
      issueCount: report.issueCount,
      repairableCount: report.repairableCount,
      repairedCount: report.repairedCount,
      skippedCount: report.skippedCount,
    },
    verification: report.verification,
    markdown: formatBookingStayDateReportMarkdown(report),
    report,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
