'use client';

import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { DepositRowActions } from '@/src/components/admin/deposits/DepositRowActions';
import type { DepositTableRow } from '@/src/components/admin/deposits/types';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  row: DepositTableRow;
  onClose: () => void;
};

function statusTone(status: DepositTableRow['invoiceStatus']) {
  switch (status) {
    case 'collecting':
      return 'amber' as const;
    case 'held':
      return 'emerald' as const;
    case 'refund_pending':
      return 'sky' as const;
    case 'settled':
      return 'zinc' as const;
    default:
      return 'zinc' as const;
  }
}

export function DepositDetailDrawer({ row, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      role="dialog"
      aria-modal
      aria-label="Deposit invoice"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0B0F14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
              Deposit invoice
            </p>
            <h2 className="truncate text-lg font-semibold text-white">{row.customerFullName}</h2>
            <p className="font-mono text-xs text-apg-silver">{row.bookingCode}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-apg-silver hover:bg-white/5 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone={statusTone(row.invoiceStatus)}>{row.displayStatus}</Badge>
            {row.isFrozen ? (
              <Badge tone="zinc">Frozen</Badge>
            ) : null}
          </div>

          <p className="text-xs text-apg-silver">
            {row.pgName} · Room {row.roomNumber} · {row.bedCode}
          </p>
          <p className="mt-1 font-mono text-xs text-apg-silver">{row.customerPhone}</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Field label="Required" value={paiseToInr(row.requiredPaise)} />
            <Field label="Collected" value={paiseToInr(row.collectedPaise)} accent="emerald" />
            <Field
              label="Deductions"
              value={row.deductionsPaise > 0 ? paiseToInr(row.deductionsPaise) : '—'}
              accent="rose"
            />
            <Field
              label="Refundable"
              value={paiseToInr(row.refundablePaise)}
              accent="strong"
            />
          </div>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold text-white">Actions</h3>
            <DepositRowActions row={row} />
          </section>

          {!row.isFrozen ? (
            <section className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold text-white">Manage</h3>
              <p className="text-xs text-apg-silver">
                Record collections, deductions, or process refund settlement.
              </p>
              <Link
                href={`/admin/deposits/${row.bookingId}`}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-3 text-sm font-semibold text-white hover:brightness-110"
              >
                Open deposit invoice →
              </Link>
              <Link
                href={`/admin/residents/${row.customerId}`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-apg-silver hover:text-white"
              >
                Resident profile
              </Link>
            </section>
          ) : (
            <p className="mt-6 rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-xs text-apg-silver">
              This invoice is settled and frozen. No further changes apply.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'rose' | 'strong';
}) {
  const valueClass =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'rose'
        ? 'text-rose-300'
        : accent === 'strong'
          ? 'text-white font-semibold'
          : 'text-white';

  return (
    <div className="rounded-lg border border-white/10 bg-[#1A1F27] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</p>
      <p className={`mt-1 text-sm tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
