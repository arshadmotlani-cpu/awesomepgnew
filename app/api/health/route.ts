import { getDatabaseEnvStatus } from '@/src/lib/db/env';
import { withSelfHealing } from '@/src/lib/healing/withSelfHealing';
import { maybeRunRecoveryCheck } from '@/src/lib/healing/healthEngine';
import { getSystemState } from '@/src/lib/healing/systemState';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle() {
  await maybeRunRecoveryCheck();
  const dbEnv = getDatabaseEnvStatus();
  const heal = getSystemState();

  return Response.json({
    ok: true,
    message: 'health route working',
    healing: {
      status: heal.status,
      safeMode: heal.safeMode,
      degradedMode: heal.degradedMode,
      dbDegradedMode: heal.dbDegradedMode,
    },
    env: {
      hasDatabaseUrl: dbEnv.hasDatabaseUrl,
      databaseUrlSet: dbEnv.databaseUrlSet,
      postgresPrismaUrlSet: dbEnv.postgresPrismaUrlSet,
      postgresUrlSet: dbEnv.postgresUrlSet,
      source: dbEnv.source,
      host: dbEnv.host,
      nodeEnv: process.env.NODE_ENV ?? 'development',
      vercel: Boolean(process.env.VERCEL),
    },
  });
}

export const GET = withSelfHealing(handle, '/api/health');
