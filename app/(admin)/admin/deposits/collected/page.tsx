import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { FinancialRowActions } from '@/src/components/admin/FinancialRowActions';
import { IconCard } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listDepositCollectionsForBillingMonth } from '@/src/db/queries/admin';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  hasOutstandingDepositDue,
  resolveDepositDisplayStatus,
} from '@/src/lib/depositCollectionLabels';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { formatDate, paiseToInr } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function DepositCollectedPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; pgId?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  const res = await listDepositCollectionsForBillingMonth(billingMonth);
  const rows =
    res.ok && sp.pgId ? res.data.filter((r) => r.pgId === sp.pgId) : res.ok ? res.data : [];

  const totalCollected = rows.reduce((a, r) => a + r.collectedThisMonthPaise, 0);
  const totalRequired = rows.reduce((a, r) => a + Number(r.depositPaise), 0);
  const totalRemaining = rows.reduce((a, r) => a + Number(r.depositDuePaise), 0);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.deposits.label, href: '/admin/deposits' },
          { label: 'Deposit collected' },
        ]}
      />
      <PageHeader
        title="Deposit collection detail"
        description={`Every deposit collected in ${monthLabel} — drill down from Overview → Deposit collected.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/deposits/add"
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Add deposit
            </Link>
            <Link
              href="/admin/deposits"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              All deposits
            </Link>
          </div>
        }
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title="No deposits collected this month"
          description="Deposit ledger entries for this billing month will appear here."
        />
      ) : (
        <>
          <section className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard label={`Collected · ${monthLabel}`} value={paiseToInr(totalCollected)} accent />
            <StatCard label="Required (bookings)" value={paiseToInr(totalRequired)} />
            <StatCard
              label="Remaining due"
              value={paiseToInr(totalRemaining)}
              accent={totalRemaining > 0}
            />
          </section>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.03]">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Resident
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      PG
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Room / bed
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Required
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Paid
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Remaining
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Status
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Collected
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((r) => {
                    const status = resolveDepositDisplayStatus(r);
                    return (
                      <tr key={r.bookingId} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/residents/${r.customerId}`}
                            className="font-medium text-white hover:text-[#FF5A1F]"
                          >
                            {r.customerFullName}
                          </Link>
                          <div className="text-[11px] text-apg-silver">{r.customerPhone}</div>
                        </td>
                        <td className="px-4 py-3 text-apg-silver">{r.pgName}</td>
                        <td className="px-4 py-3 text-xs text-apg-silver">
                          Room {r.roomNumber} · {r.bedCode}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {paiseToInr(Number(r.depositPaise))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                          {paiseToInr(Number(r.collectedPaise))}
                          {r.collectedThisMonthPaise > 0 ? (
                            <div className="text-[10px] text-emerald-400/80">
                              +{paiseToInr(r.collectedThisMonthPaise)} this month
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-200">
                          {Number(r.depositDuePaise) > 0
                            ? paiseToInr(Number(r.depositDuePaise))
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              hasOutstandingDepositDue(r)
                                ? 'rose'
                                : status === 'Refunded'
                                  ? 'zinc'
                                  : toneForStatus(r.depositCollectionStatus)
                            }
                          >
                            {status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-apg-silver">
                          {r.lastCollectedAt ? formatDate(r.lastCollectedAt) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Link
                              href={`/admin/deposits/${r.bookingId}`}
                              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-apg-silver hover:text-white"
                            >
                              Ledger
                            </Link>
                            <Link
                              href={`/admin/deposits/${r.bookingId}`}
                              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-apg-silver hover:text-white"
                            >
                              View
                            </Link>
                            <FinancialRowActions
                              residentId={r.customerId}
                              residentName={r.customerFullName}
                              phone={r.customerPhone}
                              pgId={r.pgId}
                              pgName={r.pgName}
                              amountPaise={Number(r.depositDuePaise) || Number(r.depositPaise)}
                              purpose="deposit"
                              roomNumber={r.roomNumber}
                              bookingId={r.bookingId}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-white/10 bg-[#1A1F27]'
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
