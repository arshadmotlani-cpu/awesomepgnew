import { getDeployTrackerState } from '@/src/lib/deploy/tracker';
import { listDeploymentEvents } from '@/src/lib/deploy/persistence';
import { getLatestProductionDeployment, listProductionDeployments } from '@/src/lib/deploy/vercelApi';
import { getVercelApiConfig } from '@/src/lib/deploy/config';

export async function getDeploymentsDashboardData() {
  const tracker = getDeployTrackerState();
  const events = await listDeploymentEvents(40);
  const vercelConfigured = Boolean(getVercelApiConfig());

  let vercelLatest = null;
  let vercelRecent: Awaited<ReturnType<typeof listProductionDeployments>> = [];

  if (vercelConfigured) {
    try {
      vercelLatest = await getLatestProductionDeployment();
      vercelRecent = await listProductionDeployments(8);
    } catch {
      // Vercel API optional for dashboard display
    }
  }

  const lastRollback = events.find((e) => e.status === 'failed' || e.status === 'rolling_back');

  return {
    tracker,
    vercelConfigured,
    vercelLatest,
    vercelRecent,
    events: events.map((e) => ({
      id: e.id,
      deploymentId: e.deploymentId,
      status: e.status,
      errorSummary: e.errorSummary,
      createdAt: e.createdAt.toISOString(),
    })),
    lastRollback: lastRollback
      ? {
          deploymentId: lastRollback.deploymentId,
          errorSummary: lastRollback.errorSummary,
          createdAt: lastRollback.createdAt.toISOString(),
        }
      : null,
  };
}
