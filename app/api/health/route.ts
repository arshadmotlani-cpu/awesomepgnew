import { getDatabaseEnvStatus } from '@/src/lib/db/env';
import { getIntegrationsHealthSummary } from '@/src/lib/integrations/status';
import { getSystemState } from '@/src/lib/healing/systemState';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness — env and in-memory heal state only.
 * Does not SELECT 1 or write system_health (that would keep Neon awake).
 */
async function handle() {
  const dbEnv = getDatabaseEnvStatus();
  const heal = getSystemState();
  const integrations = getIntegrationsHealthSummary();

  return Response.json({
    ok: true,
    message: 'health route working',
    blobPrivateConfigured: integrations.blob.privateConfigured,
    blobPublicConfigured: integrations.blob.publicConfigured,
    kycUploadsAvailable: integrations.kyc.uploadsAvailable,
    integrations,
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

export const GET = handle;
