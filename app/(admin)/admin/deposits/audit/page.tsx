import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  depositStatusLabel,
  type DepositCollectionStatus,
} from '@/src/lib/deposits/depositCollectionStatus';
import { paiseToInr } from '@/src/lib/format';
import { getDepositCollectionAuditReport } from '@/src/services/pgDepositCollection';

export const dynamic = 'force-dynamic';

function statusTone(status: DepositCollectionStatus) {
  switch (status) {
    case 'paid':
      return 'emerald' as const;
    case 'pending':
      return 'amber' as const;
    case 'requirement_missing':
      return 'violet' as const;
  }
}

export default async function DepositAuditPage() {
  await requireAdminSession('/admin/deposits/audit');

  let rows;
  try {
    rows = await getDepositCollectionAuditReport();
  } catch (err) {
    return (
      <>
        <PageHeader title="Deposit audit" />
        <DbStatusBanner error={err instanceof Error ? err.message : 'Unable to load audit report.'} />
      </>
    );
  }

  const missing = rows.filter((r) => r.depositStatus === 'requirement_missing');
  const pending = rows.filter((r) => r.depositStatus === 'pending');
  const paid = rows.filter((r) => r.depositStatus === 'paid');

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.deposits.label, href: '/admin/deposits' },
          { label: 'Audit report' },
        ]}
      />
      <PageHeader
        title="Deposit audit — all assigned residents"
        description="Required deposit comes from each booking record (set at bed assignment). Residents with ₹0 required and an active bed may be a configuration error."
        actions={
          <Link
            href="/admin/deposits/collected"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Deposit collection →
          </Link>
        }
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Assigned</p>
          <p className="mt-1 text-2xl font-semibold text-white">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Deposit paid</p>
          <p className="mt-1 text-2xl font-semibold text-white">{paid.length}</p>
        </div>
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Deposit pending</p>
          <p className="mt-1 text-2xl font-semibold text-white">{pending.length}</p>
        </div>
        <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-4">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Requirement missing</p>
          <p className="mt-1 text-2xl font-semibold text-white">{missing.length}</p>
        </div>
      </section>

      {missing.length > 0 ? (
        <div className="mb-6 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          <strong>{missing.length}</strong> resident{missing.length === 1 ? '' : 's'} ha
          {missing.length === 1 ? 's' : 've'} an active bed but <strong>no deposit requirement</strong>{' '}
          on the booking. Open the deposit page to set the required amount.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">Resident</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">PG</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">Room / bed</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">
                  Required
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">
                  Outstanding
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">
                  Fix
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr
                  key={r.bookingId}
                  className={
                    r.requiredDepositPaise <= 0
                      ? 'bg-violet-500/[0.06] hover:bg-violet-500/10'
                      : 'hover:bg-white/[0.03]'
                  }
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/residents/${r.customerId}`}
                      className="font-medium text-white hover:text-[#FF5A1F]"
                    >
                      {r.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-apg-silver">{r.pgName}</td>
                  <td className="px-4 py-3 text-xs text-apg-silver">
                    R{r.roomNumber} · {r.bedCode}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white">
                    {r.requiredDepositPaise > 0 ? paiseToInr(r.requiredDepositPaise) : '₹0'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-apg-silver">
                    {paiseToInr(r.paidAmountPaise)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-200">
                    {r.outstandingPaise > 0 ? paiseToInr(r.outstandingPaise) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(r.depositStatus)}>
                      {depositStatusLabel(r.depositStatus)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={
                        r.depositStatus === 'requirement_missing'
                          ? `/admin/deposits/${r.bookingId}`
                          : `/admin/residents/${r.customerId}`
                      }
                      className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                    >
                      {r.depositStatus === 'requirement_missing' ? 'Set requirement' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
