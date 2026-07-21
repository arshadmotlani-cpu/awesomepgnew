import { getAdminSession } from '@/src/lib/auth/session';
import { getRuntimeDiagnosticsSnapshot } from '@/src/lib/monitoring/runtimeDiagnostics';
import { withErrorHandler } from '@/src/lib/monitoring/withErrorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle() {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const data = getRuntimeDiagnosticsSnapshot();
  return Response.json({ ok: true, data });
}

export const GET = withErrorHandler(handle, '/api/admin/cache-diagnostics');
