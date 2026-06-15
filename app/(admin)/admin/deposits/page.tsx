import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { FinancialRowActions } from '@/src/components/admin/FinancialRowActions';
import { IconCard } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listAdminDepositSummaries } from '@/src/db/queries/admin';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  hasOutstandingDepositDue,
  labelDepositCollectionStatus,
} from '@/src/lib/depositCollectionLabels';
import { paiseToInr } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const dueOnly = sp.filter === 'due';
  const res = await listAdminDepositSummaries();
  const { listOutstandingDeposits } = await import('@/src/services/depositCollection');
  const outstanding = dueOnly ? await listOutstandingDeposits() : [];
  const outstandingIds = new Set(outstanding.map((r) => r.bookingId));

  const tableRows =
    res.ok && dueOnly
      ? res.data.filter((r) => outstandingIds.has(r.bookingId))
      : res.ok
        ? res.data
        : [];

  const totalRequired = tableRows.reduce((acc, r) => acc + Number(r.depositPaise), 0);
  const totalCollected = tableRows.reduce((acc, r) => acc + Number(r.collectedPaise), 0);
  const totalDue = tableRows.reduce((acc, r) => acc + Number(r.depositDuePaise), 0);
  const totalRefundable = tableRows.reduce(
    (acc, r) => acc + Number(r.refundableBalancePaise),
    0,
  );

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.deposits.label },
        ]}
      />
      <PageHeader
        title="Deposit management"
        description="Every booking with a security deposit — required amount, collection status, ledger balance, and refunds."
        actions={
          <Link
            href="/admin/deposits/add"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Add deposit
          </Link>
        }
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title="No deposit bookings yet"
          description="Confirmed bookings with a deposit requirement appear here, even before the first ledger entry."
        />
      ) : (
        <>
          {dueOnly ? (
            <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Showing bookings with outstanding deposit balances only.{' '}
              <Link href="/admin/deposits" className="font-semibold text-white underline">
                Clear filter
              </Link>
            </p>
          ) : (
            <p className="mb-4 text-sm text-apg-silver">
              <Link
                href="/admin/deposits?filter=due"
                className="font-semibold text-[#FF5A1F] hover:underline"
              >
                View outstanding deposits →
              </Link>
            </p>
          )}

          <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Required" value={paiseToInr(totalRequired)} />
            <StatCard label="Collected (ledger)" value={paiseToInr(totalCollected)} />
            <StatCard label="Still due" value={paiseToInr(totalDue)} accent={totalDue > 0} />
            <StatCard label="Refundable balance" value={paiseToInr(totalRefundable)} />
          </section>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.03]">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Resident / booking
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Bed
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Required
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Collected
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Due
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Deducted
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Refunded
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Balance
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-apg-silver">
                        No bookings match this filter.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((r) => (
                      <tr key={r.bookingId} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/residents/${r.customerId}`}
                            className="text-sm font-medium text-white hover:text-[#FF5A1F]"
                          >
                            {r.customerFullName}
                          </Link>
                          <div className="font-mono text-[11px] text-apg-silver">{r.customerPhone}</div>
                          <Link
                            href={`/admin/bookings/${r.bookingId}`}
                            className="mt-0.5 inline-block font-mono text-[10px] text-[#FF5A1F]/80 hover:underline"
                          >
                            {r.bookingCode}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-apg-silver">
                          {r.pgName}
                          <div>
                            Room {r.roomNumber} · {r.bedCode}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {paiseToInr(Number(r.depositPaise))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                          {paiseToInr(Number(r.collectedPaise))}
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
                                : toneForStatus(r.depositCollectionStatus)
                            }
                          >
                            {labelDepositCollectionStatus(r.depositCollectionStatus)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-rose-300">
                          {paiseToInr(Number(r.deductedPaise))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {paiseToInr(Number(r.refundedPaise))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-white">
                          {paiseToInr(Number(r.refundableBalancePaise))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number(r.refundableBalancePaise) > 0 ? (
                            <FinancialRowActions
                              residentId={r.customerId}
                              residentName={r.customerFullName}
                              phone={r.customerPhone}
                              pgId={r.pgId}
                              pgName={r.pgName}
                              amountPaise={Number(r.refundableBalancePaise)}
                              purpose="deposit"
                              bookingId={r.bookingId}
                            />
                          ) : (
                            <Link
                              href={`/admin/deposits/${r.bookingId}`}
                              className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                            >
                              Open →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
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
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'rounded-xl border p-4 ' +
        (accent
          ? 'border-amber-400/30 bg-amber-500/10'
          : 'border-white/10 bg-[#1A1F27]')
      }
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
