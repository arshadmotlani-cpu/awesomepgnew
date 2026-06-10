import { MonitoringDashboard } from '@/src/components/admin/MonitoringDashboard';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { getMonitoringSnapshot } from '@/src/db/queries/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminMonitoringPage() {
  let initial = null;
  let initialError: string | null = null;

  try {
    initial = await getMonitoringSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation .*app_logs.* does not exist/i.test(message)) {
      initialError = 'Run npm run db:migrate to create the app_logs table.';
    } else {
      initialError = message;
    }
  }

  return (
    <>
      <PageHeader
        title="Monitoring"
        description="Internal observability — API logs, DB tracing, errors, and audit trail. Independent of Vercel logs."
      />
      <MonitoringDashboard initial={initial} initialError={initialError} />
    </>
  );
}
