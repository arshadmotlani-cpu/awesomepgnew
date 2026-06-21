import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { DepositPendingRowActions } from '@/src/components/admin/deposits/DepositPendingRowActions';
import { IconCard } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  getAllPgDepositCollectionSummaries,
  getPgDepositCollectionDetail,
} from '@/src/services/pgDepositCollection';

export const dynamic = 'force-dynamic';

export default async function DepositCollectedPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; pgId?: string }>;
}) {
  await requireAdminSession('/admin/deposits/collected');
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  if (sp.pgId) {
    let detail;
    try {
      detail = await getPgDepositCollectionDetail(sp.pgId, billingMonth);
    } catch (err) {
      return (
        <>
          <PageHeader title="Deposit collection" />
          <DbStatusBanner
            error={err instanceof Error ? err.message : 'Unable to load deposit collection.'}
          />
        </>
      );
    }

    if (!detail) {
      return (
        <>
          <PageHeader title="Deposit collection" description="PG not found." />
          <Link href={`/admin/deposits/collected?month=${billingMonth}`} className="text-sm text-[#FF5A1F]">
            ← All PGs
          </Link>
        </>
      );
    }

    const { stats, paidResidents, pendingResidents } = detail;

    return (
      <>
        <ModuleBreadcrumbs
          items={[
            { label: 'Overview', href: moduleHref('overview') },
            { label: ADMIN_MODULES.revenue.label, href: '/admin/revenue' },
            { label: 'Deposit collection', href: `/admin/deposits/collected?month=${billingMonth}` },
            { label: detail.pgName },
          ]}
        />
        <PageHeader
          title={`${detail.pgName} — deposit collection`}
          description={`Assigned residents only · ${monthLabel}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/deposits/collected?month=${billingMonth}`}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
              >
                All PGs
              </Link>
              <OverviewMonthPicker billingMonth={billingMonth} />
            </div>
          }
        />

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total beds" value={String(stats.totalBeds)} />
          <StatCard label="Assigned residents" value={String(stats.assignedResidents)} accent />
          <StatCard label="Deposit paid" value={String(stats.depositPaidCount)} accent="emerald" />
          <StatCard label="Deposit pending" value={String(stats.depositPendingCount)} accent="amber" />
          <StatCard
            label={`Collected · ${monthLabel}`}
            value={paiseToInr(stats.depositCollectedMtdPaise)}
            accent="orange"
          />
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold text-white">
            Paid residents ({paidResidents.length})
          </h2>
          {paidResidents.length === 0 ? (
            <p className="text-sm text-apg-silver">No assigned residents with deposit fully paid.</p>
          ) : (
            <ResidentTable
              rows={paidResidents}
              mode="paid"
              pgId={detail.pgId}
              pgName={detail.pgName}
            />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">
            Pending deposit ({pendingResidents.length})
          </h2>
          <p className="text-xs text-apg-silver">
            Only residents with an active bed assignment and outstanding deposit balance.
          </p>
          {pendingResidents.length === 0 ? (
            <p className="text-sm text-apg-silver">All assigned residents have paid their deposit.</p>
          ) : (
            <ResidentTable
              rows={pendingResidents}
              mode="pending"
              pgId={detail.pgId}
              pgName={detail.pgName}
            />
          )}
        </section>
      </>
    );
  }

  let summaries;
  try {
    summaries = await getAllPgDepositCollectionSummaries(billingMonth);
  } catch (err) {
    return (
      <>
        <PageHeader title="Deposit collection detail" />
        <DbStatusBanner
          error={err instanceof Error ? err.message : 'Unable to load deposit summaries.'}
        />
      </>
    );
  }

  const totalCollected = summaries.reduce((a, s) => a + s.depositCollectedMtdPaise, 0);
  const totalPaid = summaries.reduce((a, s) => a + s.depositPaidCount, 0);
  const totalPending = summaries.reduce((a, s) => a + s.depositPendingCount, 0);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.revenue.label, href: '/admin/revenue' },
          { label: 'Deposit collection' },
        ]}
      />
      <PageHeader
        title="Deposit collection"
        description={`Select a PG for paid / pending breakdown · ${monthLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/deposits"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              All deposits
            </Link>
            <OverviewMonthPicker billingMonth={billingMonth} />
          </div>
        }
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={`Collected · ${monthLabel}`} value={paiseToInr(totalCollected)} accent="orange" />
        <StatCard label="Residents · deposit paid" value={String(totalPaid)} accent="emerald" />
        <StatCard label="Residents · deposit pending" value={String(totalPending)} accent="amber" />
      </section>

      {summaries.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title="No PG listings"
          description="Add a PG to track deposit collection."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-apg-silver">
              <tr>
                <th className="px-4 py-3">PG</th>
                <th className="px-4 py-3">Deposit revenue</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {summaries.map((row) => (
                <tr key={row.pgId} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{row.pgName}</td>
                  <td className="px-4 py-3 font-medium text-emerald-300">
                    {paiseToInr(row.depositCollectedMtdPaise)}
                  </td>
                  <td className="px-4 py-3 text-apg-silver">{row.depositPaidCount}</td>
                  <td className="px-4 py-3">
                    {row.depositPendingCount > 0 ? (
                      <Badge tone="amber">{row.depositPendingCount} pending</Badge>
                    ) : (
                      <span className="text-apg-silver">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/deposits/collected?pgId=${row.pgId}&month=${billingMonth}`}
                      className="text-[#FF5A1F] hover:underline"
                    >
                      View collection →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  accent?: boolean | 'emerald' | 'amber' | 'orange';
}) {
  const border =
    accent === 'emerald'
      ? 'border-emerald-400/30 bg-emerald-500/10'
      : accent === 'amber'
        ? 'border-amber-400/30 bg-amber-500/10'
        : accent === 'orange'
          ? 'border-orange-400/30 bg-orange-500/10'
          : accent
            ? 'border-emerald-400/30 bg-emerald-500/10'
            : 'border-white/10 bg-[#1A1F27]';
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ResidentTable({
  rows,
  mode,
  pgId,
  pgName,
}: {
  rows: import('@/src/services/pgDepositCollection').PgDepositResidentRow[];
  mode: 'paid' | 'pending';
  pgId: string;
  pgName: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                Resident
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                Room / bed
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                Required
              </th>
              {mode === 'paid' ? (
                <>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Paid
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Payment date
                  </th>
                </>
              ) : (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Outstanding
                </th>
              )}
              {mode === 'pending' ? (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.bookingId} className="transition hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/residents/${r.customerId}`}
                    className="font-medium text-white hover:text-[#FF5A1F]"
                  >
                    {r.customerName}
                  </Link>
                  <div className="text-[11px] text-apg-silver">{r.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs text-apg-silver">
                  Room {r.roomNumber} · {r.bedCode}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white">
                  {paiseToInr(r.requiredDepositPaise)}
                </td>
                {mode === 'paid' ? (
                  <>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                      {paiseToInr(r.paidAmountPaise)}
                    </td>
                    <td className="px-4 py-3 text-xs text-apg-silver">
                      {r.paymentDate ? formatDate(r.paymentDate) : '—'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-200">
                      {paiseToInr(r.outstandingPaise)}
                    </td>
                    <td className="px-4 py-3">
                      <DepositPendingRowActions pgId={pgId} pgName={pgName} resident={r} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
