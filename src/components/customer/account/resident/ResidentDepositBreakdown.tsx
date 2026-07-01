'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import { ApgCard } from '@/src/components/customer/design-system';
import type { DepositSummary } from '@/src/services/deposits';

type Entry = NonNullable<DepositSummary['entries']>[number];

function EntryList({
  title,
  description,
  entries,
  emptyMessage,
  amountClassName,
}: {
  title: string;
  description: string;
  entries: Entry[];
  emptyMessage: string;
  amountClassName: string;
}) {
  return (
    <ApgCard tier="account" className="p-5">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-xs text-zinc-600">{description}</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{entry.reason}</p>
                <p className="text-xs text-zinc-500">{formatDate(entry.createdAt)}</p>
              </div>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${amountClassName}`}>
                {paiseToInr(Math.abs(entry.amountPaise))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ApgCard>
  );
}

export function ResidentDepositBreakdown({ entries }: { entries: Entry[] }) {
  const credits = entries.filter((e) => e.entryKind === 'collected');
  const deductions = entries.filter((e) => e.entryKind === 'deducted');
  const refunds = entries.filter((e) => e.entryKind === 'refunded');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <EntryList
        title="Deposit credits"
        description="Payments you made toward your security deposit."
        entries={credits}
        emptyMessage="No deposit payments recorded yet."
        amountClassName="text-emerald-800"
      />
      <EntryList
        title="Deposit deductions"
        description="Charges applied from your deposit at checkout."
        entries={[...deductions, ...refunds]}
        emptyMessage="No deductions or refunds yet."
        amountClassName="text-rose-700"
      />
    </div>
  );
}
