import { notFound } from 'next/navigation';
import { PgBulkPricingPanel } from '@/src/components/admin/pgs/PgBulkPricingPanel';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getPgPricingDashboard } from '@/src/services/bulkPgPricing';
import { getPgForAdmin } from '@/src/services/pgAdmin';

export const dynamic = 'force-dynamic';

export default async function PgPricingPage({
  params,
}: {
  params: Promise<{ pgId: string }>;
}) {
  const { pgId } = await params;
  const session = await requireAdminPermission('pgs:write');
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const dashboard = await getPgPricingDashboard(session, pgId);

  return (
    <PgBulkPricingPanel
      pgId={pgId}
      pgName={pg.name}
      isSuperAdmin={session.role === 'super_admin'}
      summary={{
        bedCount: dashboard.summary.bedCount,
        oldAvgRentPaise: dashboard.summary.oldAvgRentPaise,
        oldAvgDepositPaise: dashboard.summary.oldAvgDepositPaise,
      }}
      beds={dashboard.beds}
      revisions={dashboard.revisions}
      lastRevision={dashboard.lastRevision}
    />
  );
}
