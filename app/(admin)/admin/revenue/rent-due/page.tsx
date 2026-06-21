import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  groupUpcomingRentDueByDate,
  listUpcomingRentDueDates,
} from '@/src/services/upcomingRentDue';

export const dynamic = 'force-dynamic';

export default async function UpcomingRentDuePage({
  searchParams,
}: {
  searchParams: Promise<{ pgId?: string }>;
}) {
  await requireAdminSession('/admin/revenue/rent-due');
  const sp = await searchParams;

  let rows;
  try {
    rows = await listUpcomingRentDueDates({ pgId: sp.pgId });
  } catch (err) {
    return (
      <>
        <PageHeader title="Upcoming rent due dates" />
        <DbStatusBanner error={err instanceof Error ? err.message : 'Unable to load rent due dates.'} />
      </>
    );
  }

  const groups = groupUpcomingRentDueByDate(rows);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.revenue.label, href: '/admin/revenue' },
          { label: 'Upcoming rent due' },
        ]}
      />
      <PageHeader
        title="Upcoming rent due dates"
        description="Assigned residents sorted by nearest rent due date — click a name for the full profile."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/deposits/collected"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              Deposit collection
            </Link>
            <Link
              href="/admin/revenue/billing"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              Billing hub
            </Link>
          </div>
        }
      />

      {groups.length === 0 ? (
        <p className="text-sm text-apg-silver">No assigned residents with rent schedules found.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.dueDate} className="rounded-xl border border-white/10 bg-[#1A1F27]">
              <header className="border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">{formatDate(group.dueDate)}</h2>
                <p className="text-xs text-apg-silver">
                  {group.residents.length} resident{group.residents.length === 1 ? '' : 's'}
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-apg-silver">
                    <tr>
                      <th className="px-4 py-2">Resident</th>
                      <th className="px-4 py-2">Room · bed</th>
                      <th className="px-4 py-2">PG</th>
                      <th className="px-4 py-2 text-right">Days remaining</th>
                      <th className="px-4 py-2 text-right">Rent amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {group.residents.map((r) => (
                      <tr key={r.bookingId} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/residents/${r.customerId}`}
                            className="font-medium text-white hover:text-[#FF5A1F]"
                          >
                            {r.customerName}
                          </Link>
                          <div className="text-[11px] text-apg-silver">{r.phone}</div>
                        </td>
                        <td className="px-4 py-3 text-apg-silver">
                          {r.roomNumber} · {r.bedCode}
                        </td>
                        <td className="px-4 py-3 text-apg-silver">{r.pgName}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {r.daysRemaining === 0
                            ? 'Due today'
                            : r.daysRemaining < 0
                              ? `${Math.abs(r.daysRemaining)}d overdue`
                              : `${r.daysRemaining}d`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                          {r.monthlyRentPaise > 0 ? paiseToInr(r.monthlyRentPaise) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
