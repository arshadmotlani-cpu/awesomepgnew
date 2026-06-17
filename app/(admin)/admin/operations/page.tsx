import Link from 'next/link';
import { ActionCenter } from '@/src/components/admin/ActionCenter';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OperationsCenter } from '@/src/components/admin/OperationsCenter';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { RefundRequestsOpsPanel } from '@/src/components/admin/RefundRequestsOpsPanel';
import { SyncActionsButton } from '@/src/components/admin/SyncActionsButton';
import { getOccupancyByPg } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref, modulePgHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { loadOverviewContext } from '@/src/services/overviewData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OperationsModulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const billingMonth = resolveBillingMonth((await searchParams).month);
  await ensureAdminPageNotificationsSeen('/admin/operations', '/admin/operations');
  const session = await requireAdminSession('/admin/operations');
  const ctx = await loadOverviewContext(session, billingMonth);
  const occupancy = await getOccupancyByPg().catch(() => ({ ok: false as const, error: '' }));

  if (!ctx.ok) {
    return (
      <>
        <PageHeader title="Operations" />
        <DbStatusBanner error={ctx.error} />
      </>
    );
  }

  const { data } = ctx;
  const pgHref = (pgId: string) => modulePgHref('operations', pgId, billingMonth);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.operations.label },
        ]}
      />
      <PageHeader
        title="Operations"
        description="Beds, vacating, KYC, and occupancy — assign residents from the Residents module."
        actions={
          <div className="flex gap-2">
            <SyncActionsButton />
            <OverviewMonthPicker billingMonth={billingMonth} />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          ['Residents & bed assignment', moduleHref('residents')],
          ['KYC review', moduleHref('kyc')],
          ['Vacating', '/admin/vacating'],
          ['Refund requests', '/admin/requests'],
          ['Bookings', '/admin/bookings'],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
          >
            {label} →
          </Link>
        ))}
      </div>

      <div className="space-y-8">
        <AdminSectionErrorBoundary title="Refund requests">
          <RefundRequestsOpsPanel session={session} />
        </AdminSectionErrorBoundary>

        {data.operations ? (
          <AdminSectionErrorBoundary title="Operations queues">
            <OperationsCenter data={data.operations} />
          </AdminSectionErrorBoundary>
        ) : null}

        {occupancy.ok && occupancy.data.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Occupancy by PG</h2>
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#1A1F27]">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-apg-silver">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3">PG</th>
                    <th className="px-4 py-3">Occupancy</th>
                    <th className="px-4 py-3">Beds</th>
                    <th className="px-4 py-3">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-apg-silver">
                  {occupancy.data.map((pg) => (
                    <tr key={pg.pgId} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={pgHref(pg.pgId)} className="font-medium text-white hover:text-[#FF5A1F]">
                          {pg.pgName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{pg.occupancyPct}%</td>
                      <td className="px-4 py-3">
                        {pg.occupiedBeds}/{pg.totalBeds}
                      </td>
                      <td className="px-4 py-3">{pg.availableBeds}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {data.actionItems.length > 0 ? (
          <AdminSectionErrorBoundary title="Action queue">
            <ActionCenter items={data.actionItems} />
          </AdminSectionErrorBoundary>
        ) : null}
      </div>
    </>
  );
}
