import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { getEnvHealthSummary } from '@/src/lib/healing/envHealer';
import {
  getLatestPersistedHealth,
  maybeRunRecoveryCheck,
  runHealthDiagnosis,
} from '@/src/lib/healing/healthEngine';
import { getSystemState } from '@/src/lib/healing/systemState';
import { withSelfHealing } from '@/src/lib/healing/withSelfHealing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(_req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  await maybeRunRecoveryCheck();
  const state = await runHealthDiagnosis();
  const persisted = await getLatestPersistedHealth();
  const env = getEnvHealthSummary();

  return Response.json({
    ok: true,
    data: {
      ...state,
      env,
      persisted: persisted
        ? {
            status: persisted.status,
            dbStatus: persisted.dbStatus,
            envStatus: persisted.envStatus,
            lastError: persisted.lastError,
            updatedAt: persisted.updatedAt.toISOString(),
          }
        : null,
    },
  });
}

export const GET = withSelfHealing(handle, '/api/admin/health');
