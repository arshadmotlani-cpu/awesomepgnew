import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { withErrorHandler } from '@/src/lib/monitoring/withErrorHandler';
import {
  getAdminOverviewKpis,
  getVisitorCountSummary,
} from '@/src/services/visitorAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const billingMonth = req.nextUrl.searchParams.get('month') ?? undefined;

  try {
    const [visitors, kpis] = await Promise.all([
      getVisitorCountSummary(),
      getAdminOverviewKpis(session, billingMonth),
    ]);
    return Response.json({ ok: true, data: { visitors, kpis } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation .*visitor_sessions.* does not exist/i.test(message)) {
      return Response.json({
        ok: false,
        error: 'Analytics tables not migrated. Run npm run db:migrate.',
      }, { status: 503 });
    }
    throw error;
  }
}

export const GET = withErrorHandler(handle, '/api/admin/analytics/summary');
