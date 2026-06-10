import { DeploymentsDashboard } from '@/src/components/admin/DeploymentsDashboard';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { getDeploymentsDashboardData } from '@/src/db/queries/deployments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminDeploymentsPage() {
  let initial = null;
  let initialError: string | null = null;

  try {
    initial = await getDeploymentsDashboardData();
  } catch (error) {
    initialError = error instanceof Error ? error.message : String(error);
    if (/relation .*deployments.* does not exist/i.test(initialError)) {
      initialError = 'Run npm run db:migrate to create the deployments table.';
    }
  }

  return (
    <>
      <PageHeader
        title="Deploy watchdog"
        description="Monitors every production deploy, runs health checks after warm-up, and auto-rolls back broken releases via the Vercel API."
      />
      <DeploymentsDashboard initial={initial} initialError={initialError} />
    </>
  );
}
