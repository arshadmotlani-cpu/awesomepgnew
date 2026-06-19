import Link from 'next/link';
import { ActionCenter } from '@/src/components/admin/ActionCenter';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { OperationsCenter } from '@/src/components/admin/OperationsCenter';
import { RefundRequestsOpsPanel } from '@/src/components/admin/RefundRequestsOpsPanel';
import { SyncActionsButton } from '@/src/components/admin/SyncActionsButton';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import type { OperationsCenterData } from '@/src/services/operationsCenter';
import type { ActionItemRow } from '@/src/services/actionItems';
import type { AdminSession } from '@/src/lib/auth/session';
import { moduleHref, modulePgHref } from '@/src/lib/admin/navigation';

type OccupancyRow = {
  pgId: string;
  pgName: string;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
  availableBeds: number;
};

export function ResidentOperationsAdvancedTools({
  session,
  billingMonth,
  operations,
  actionItems,
  occupancy,
}: {
  session: AdminSession;
  billingMonth: string;
  operations: OperationsCenterData | null;
  actionItems: ActionItemRow[];
  occupancy: OccupancyRow[];
}) {
  const pgHref = (pgId: string) => modulePgHref('operations', pgId, billingMonth);

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Legacy operations modules, occupancy tables, and sync — unchanged from before."
      defaultOpen={false}
    >
      <div className="flex flex-wrap gap-2">
        <SyncActionsButton />
        <OverviewMonthPicker billingMonth={billingMonth} />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['Bed assignment', '/admin/beds'],
          ['KYC review', moduleHref('kyc')],
          ['Vacating', '/admin/vacating'],
          ['Refund requests', '/admin/requests'],
          ['Bookings', '/admin/bookings'],
          ['Billing', '/admin/revenue/billing'],
          ['Deposits', '/admin/deposits'],
          ['Checkout settlements', '/admin/checkout-settlements'],
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

      <RefundRequestsOpsPanel session={session} />

      {operations ? <OperationsCenter data={operations} /> : null}

      {occupancy.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Occupancy by PG</h3>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
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
                {occupancy.map((pg) => (
                  <tr key={pg.pgId} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link
                        href={pgHref(pg.pgId)}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
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

      {actionItems.length > 0 ? <ActionCenter items={actionItems} /> : null}
    </AdminAdvancedToolsSection>
  );
}
