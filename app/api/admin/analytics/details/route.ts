import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { withErrorHandler } from '@/src/lib/monitoring/withErrorHandler';
import {
  getBookingFunnel,
  getDeviceBreakdown,
  getLocationBreakdown,
  getPageAnalytics,
  getTrafficSourceBreakdown,
  getVisitorChartSeries,
} from '@/src/services/visitorAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseDateRange(req: NextRequest): { from: Date; to: Date } {
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : new Date();
  const from = fromParam
    ? new Date(`${fromParam}T00:00:00.000Z`)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

async function handle(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { from, to } = parseDateRange(req);
  const granularity =
    (req.nextUrl.searchParams.get('granularity') as 'daily' | 'weekly' | 'monthly') ??
    'daily';

  try {
    const [chart, pages, funnel, sources, devices, locations] = await Promise.all([
      getVisitorChartSeries({ granularity, from, to }),
      getPageAnalytics({ from, to }),
      getBookingFunnel({ from, to }),
      getTrafficSourceBreakdown({ from, to }),
      getDeviceBreakdown({ from, to }),
      getLocationBreakdown({ from, to }),
    ]);

    return Response.json({
      ok: true,
      data: { chart, pages, funnel, sources, devices, locations, from: from.toISOString(), to: to.toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation .*visitor_sessions.* does not exist/i.test(message)) {
      return Response.json({
        ok: false,
        error: 'Analytics tables not migrated. Run npm run db:migrate.',
      }, { status: 503 });
    }
    console.error('[analytics/details]', message);
    return Response.json(
      { ok: false, error: 'Could not load visitor analytics. Try again in a moment.' },
      { status: 500 },
    );
  }
}

export const GET = withErrorHandler(handle, '/api/admin/analytics/details');
