import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { getDeploymentsDashboardData } from '@/src/db/queries/deployments';
import { withSelfHealing } from '@/src/lib/healing/withSelfHealing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(_req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const data = await getDeploymentsDashboardData();
  return Response.json({ ok: true, data });
}

export const GET = withSelfHealing(handle, '/api/admin/deployments');
