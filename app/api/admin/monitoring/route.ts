import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { withErrorHandler } from '@/src/lib/monitoring/withErrorHandler';
import { getMonitoringSnapshot } from '@/src/db/queries/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const level = req.nextUrl.searchParams.get('level') ?? undefined;
  const search = req.nextUrl.searchParams.get('search') ?? undefined;

  try {
    const data = await getMonitoringSnapshot({ level, search });
    return Response.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation .*app_logs.* does not exist/i.test(message)) {
      return Response.json({
        ok: false,
        error: 'Monitoring tables not migrated. Run npm run db:migrate.',
      }, { status: 503 });
    }
    throw error;
  }
}

export const GET = withErrorHandler(handle, '/api/admin/monitoring');
