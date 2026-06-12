import { getAdminSession } from '@/src/lib/auth/session';
import { withErrorHandler } from '@/src/lib/monitoring/withErrorHandler';
import { getLiveVisitorsSnapshot } from '@/src/services/visitorAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle() {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getLiveVisitorsSnapshot();
    return Response.json({ ok: true, data });
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

export const GET = withErrorHandler(handle, '/api/admin/analytics/live');
