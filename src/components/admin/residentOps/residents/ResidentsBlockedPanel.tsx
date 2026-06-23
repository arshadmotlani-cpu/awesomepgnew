import Link from 'next/link';
import type { BlockedResidentRow } from '@/src/lib/residents/residentOperationsResidentsView';
import { OpsPanel, OpsSection } from '@/src/components/admin/residentOps/residentOpsUi';

const PRIMARY =
  'inline-flex min-h-[32px] items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110';

export function ResidentsBlockedPanel({ items }: { items: BlockedResidentRow[] }) {
  return (
    <OpsSection
      id="blocked"
      title="Blocked residents"
      description="Waiting on admin — these should never disappear into other queues."
    >
      {items.length === 0 ? (
        <OpsPanel className="px-6 py-8">
          <p className="text-sm text-apg-silver">No residents blocked on admin action right now.</p>
        </OpsPanel>
      ) : (
        <OpsPanel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  {['Resident', 'PG', 'Why blocked', 'Waiting', 'Action'].map((label, i) => (
                    <th
                      key={label}
                      className={
                        'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-apg-silver ' +
                        (i === 4 ? 'text-right' : '')
                      }
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/residents/${row.customerId}`}
                        className="font-semibold text-white hover:text-[#FF5A1F]"
                      >
                        {row.residentName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-apg-silver">{row.pgName ?? '—'}</td>
                    <td className="max-w-xs px-4 py-3 text-apg-silver">{row.reason}</td>
                    <td className="px-4 py-3 text-amber-200">{row.blockedSinceLabel}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={row.primaryHref} className={PRIMARY}>
                        {row.primaryActionLabel}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OpsPanel>
      )}
    </OpsSection>
  );
}
