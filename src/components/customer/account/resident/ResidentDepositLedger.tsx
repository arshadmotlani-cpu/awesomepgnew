'use client';

import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { ACCOUNT_TABLE_HEAD } from '@/src/components/customer/accountStyles';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import type { DepositSummary } from '@/src/services/deposits';

type Entry = NonNullable<DepositSummary['entries']>[number];

export function ResidentDepositLedger({ entries }: { entries: Entry[] }) {
  return (
    <ResidentMoreSection
      title="Deposit ledger"
      description="Every deposit payment, charge, and refund."
      defaultOpen
    >
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className={ACCOUNT_TABLE_HEAD}>
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">
                  No deposit entries yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2 text-xs">{formatDate(entry.createdAt)}</td>
                  <td className="px-3 py-2">{titleCase(entry.entryKind)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">{entry.reason}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {paiseToInr(entry.amountPaise)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ResidentMoreSection>
  );
}
