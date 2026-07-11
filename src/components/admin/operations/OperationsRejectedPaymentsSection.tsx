import Link from 'next/link';
import { formatDateTime } from '@/src/lib/format';
import type { PaymentProofRejectionHistoryRow } from '@/src/services/paymentProofRejectionService';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';

/**
 * Recently rejected payment proofs — review-only history for Operations.
 * Does not change queue eligibility; Waiting for Approval stays the active queue.
 */
export function OperationsRejectedPaymentsSection({
  rows,
}: {
  rows: PaymentProofRejectionHistoryRow[];
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">Payment History · Rejected</h2>
          <p className="mt-1 text-xs text-apg-silver">
            Previously rejected proofs for your PGs — audit trail only.
          </p>
        </div>
        <Link
          href={operationsFilterHref('waiting_for_approval')}
          className="text-xs font-medium text-[#FF5A1F] hover:brightness-110"
        >
          Back to Waiting for Approval
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-apg-silver">
          No rejected payments yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
              <tr>
                <th className="px-4 py-3 font-medium">Rejected at</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Resident message</th>
                <th className="px-4 py-3 font-medium">By</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-3 text-apg-silver">
                    {formatDateTime(row.rejectedAt)}
                  </td>
                  <td className="px-4 py-3 text-white">
                    {row.reasonLabel}
                    {row.reasonDetail ? (
                      <span className="mt-0.5 block text-xs text-apg-silver">{row.reasonDetail}</span>
                    ) : null}
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-apg-silver">
                      {row.entityType.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="max-w-sm px-4 py-3 text-apg-silver">
                    <span className="line-clamp-3 text-xs">{row.residentMessage}</span>
                  </td>
                  <td className="px-4 py-3 text-apg-silver">{row.rejectedByName ?? 'Admin'}</td>
                  <td className="px-4 py-3 text-apg-silver">{row.whatsappSent ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
