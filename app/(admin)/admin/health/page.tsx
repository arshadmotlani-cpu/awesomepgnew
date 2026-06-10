import { HealthDashboard } from '@/src/components/admin/HealthDashboard';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { getEnvHealthSummary } from '@/src/lib/healing/envHealer';
import { getLatestPersistedHealth, runHealthDiagnosis } from '@/src/lib/healing/healthEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminHealthPage() {
  let initial = null;
  let initialError: string | null = null;

  try {
    const state = await runHealthDiagnosis();
    const persisted = await getLatestPersistedHealth();
    const env = getEnvHealthSummary();
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
        title="Self-healing health"
        description="Auto-detects env/DB issues, enters safe mode when needed, and recovers without manual intervention."
      />
      <HealthDashboard initial={initial} initialError={initialError} />
    </>
  );
}
