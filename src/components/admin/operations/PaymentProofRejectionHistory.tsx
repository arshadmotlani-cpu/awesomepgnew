import { formatDateTime } from '@/src/lib/format';
import type { PaymentProofRejectionHistoryRow } from '@/src/services/paymentProofRejectionService';

export function PaymentProofRejectionHistory({
  rows,
}: {
  rows: PaymentProofRejectionHistoryRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-[#141820] px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
        Rejection history
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-apg-silver">
            <tr>
              <th className="pb-2 pr-4 font-medium">Rejected by</th>
              <th className="pb-2 pr-4 font-medium">Rejected at</th>
              <th className="pb-2 pr-4 font-medium">Reason</th>
              <th className="pb-2 pr-4 font-medium">Message sent</th>
              <th className="pb-2 font-medium">WhatsApp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-white">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-4">{row.rejectedByName ?? 'Admin'}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {formatDateTime(row.rejectedAt)}
                </td>
                <td className="py-2 pr-4">
                  {row.reasonLabel}
                  {row.reasonDetail ? (
                    <span className="block text-apg-silver">{row.reasonDetail}</span>
                  ) : null}
                </td>
                <td className="max-w-xs py-2 pr-4 text-apg-silver">
                  <span className="line-clamp-3">{row.residentMessage}</span>
                </td>
                <td className="py-2">{row.whatsappSent ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
