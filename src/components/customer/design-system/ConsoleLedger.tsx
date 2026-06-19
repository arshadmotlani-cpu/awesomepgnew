'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { StatusChip } from '@/src/components/customer/design-system/StatusChip';

export type ConsoleLedgerEntry = {
  id: string;
  date: string | Date;
  typeLabel: string;
  direction: 'credit' | 'debit';
  amountPaise: number;
  /** Null when running balance does not apply (e.g. rent payment outflow). */
  runningBalancePaise: number | null;
  detail?: string | null;
  status?: string | null;
  invoiceHref?: string | null;
};

const FINANCE_STATUS_TONE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  succeeded: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  due: 'bg-amber-50 text-amber-800 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-800 ring-rose-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  initiated: 'bg-sky-50 text-sky-800 ring-sky-200',
  failed: 'bg-rose-50 text-rose-800 ring-rose-200',
  cancelled: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

const PAGE_SIZE = 25;

type Props = {
  entries: ConsoleLedgerEntry[];
  emptyMessage?: string;
  showRunningBalance?: boolean;
};

/** Bank-statement style ledger — date, type, credit/debit, optional running balance. */
export function ConsoleLedger({
  entries,
  emptyMessage = 'No activity yet.',
  showRunningBalance = true,
}: Props) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const slice = useMemo(() => entries.slice(0, visible), [entries, visible]);

  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 hidden sm:table-cell">Details</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              {showRunningBalance ? (
                <th className="px-3 py-2.5 text-right">Balance</th>
              ) : null}
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {slice.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-600">
                  {formatDate(row.date)}
                </td>
                <td className="px-3 py-3 font-medium text-zinc-900">{row.typeLabel}</td>
                <td className="hidden max-w-[180px] truncate px-3 py-3 text-xs text-zinc-500 sm:table-cell">
                  {row.detail ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums font-semibold">
                  <span className={row.direction === 'credit' ? 'text-emerald-700' : 'text-zinc-900'}>
                    {row.direction === 'credit' ? '+' : '−'}
                    {paiseToInr(Math.abs(row.amountPaise))}
                  </span>
                </td>
                {showRunningBalance ? (
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-700">
                    {row.runningBalancePaise != null ? paiseToInr(row.runningBalancePaise) : '—'}
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-1">
                    {row.status ? (
                      <StatusChip status={row.status} toneMap={FINANCE_STATUS_TONE} />
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                    {row.invoiceHref ? (
                      <Link
                        href={row.invoiceHref}
                        className="text-[11px] font-medium text-indigo-700 hover:text-indigo-600"
                      >
                        View invoice →
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible < entries.length ? (
        <button
          type="button"
          onClick={() => setVisible((n) => n + PAGE_SIZE)}
          className="mt-4 w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Load more ({entries.length - visible} remaining)
        </button>
      ) : null}
    </div>
  );
}
