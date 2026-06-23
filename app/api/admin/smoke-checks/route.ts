import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { withErrorHandler } from '@/src/lib/monitoring/withErrorHandler';
import { runAdminSmokeChecks } from '@/src/services/adminSmokeChecks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(_req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const report = await runAdminSmokeChecks();
  return Response.json({ ok: true, data: report });
}

export const GET = withErrorHandler(handle, '/api/admin/smoke-checks');
