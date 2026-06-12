import { HealthDashboard } from '@/src/components/admin/HealthDashboard';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { getEnvHealthSummary } from '@/src/lib/healing/envHealer';
import { getIntegrationsHealthSummaryWithBlobProbe } from '@/src/lib/integrations/status';
import { getLatestPersistedHealth, runHealthDiagnosis } from '@/src/lib/healing/healthEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminHealthPage() {
  let initial = null;
  let initialError: string | null = null;

  try {
    const state = await runHealthDiagnosis();
    const persisted = await getLatestPersistedHealth();
    const envBase = getEnvHealthSummary();
    const integrations = await getIntegrationsHealthSummaryWithBlobProbe();
    const env = { ...envBase, integrations };
    initial = { ...state, env, persisted: persisted ? {
      status: persisted.status,
      dbStatus: persisted.dbStatus,
      envStatus: persisted.envStatus,
      lastError: persisted.lastError,
      updatedAt: persisted.updatedAt.toISOString(),
    } : null };
  } catch (error) {
    initialError = error instanceof Error ? error.message : String(error);
  }

  return (
    <>
      <PageHeader
        title="Diagnostics & health"
        description="Database, Vercel Blob, email, Razorpay, and KYC storage status. Auto-detects env/DB issues and recovers when possible."
      />
      <HealthDashboard initial={initial} initialError={initialError} />
    </>
  );
}
