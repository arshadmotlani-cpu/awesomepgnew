'use client';

import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DepositRowActions } from '@/src/components/admin/deposits/DepositRowActions';
import type { DepositTableRow } from '@/src/components/admin/deposits/types';
import {
  hasOutstandingDepositDue,
  labelDepositCollectionStatus,
} from '@/src/lib/depositCollectionLabels';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  row: DepositTableRow;
  onClose: () => void;
};

export function DepositDetailDrawer({ row, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      role="dialog"
      aria-modal
      aria-label="Deposit details"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0B0F14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Deposit</p>
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
            <Badge
              tone={
                hasOutstandingDepositDue(row)
                  ? 'rose'
                  : toneForStatus(row.depositCollectionStatus)
              }
            >
              {labelDepositCollectionStatus(row.depositCollectionStatus)}
            </Badge>
          </div>

          <p className="text-xs text-apg-silver">
            {row.pgName} · Room {row.roomNumber} · {row.bedCode}
          </p>
          <p className="mt-1 font-mono text-xs text-apg-silver">{row.customerPhone}</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Field label="Required" value={paiseToInr(row.depositPaise)} />
            <Field label="Collected" value={paiseToInr(row.collectedPaise)} accent="emerald" />
            <Field
              label="Still due"
              value={row.depositDuePaise > 0 ? paiseToInr(row.depositDuePaise) : '—'}
              accent={row.depositDuePaise > 0 ? 'amber' : undefined}
            />
            <Field label="Deducted" value={paiseToInr(row.deductedPaise)} accent="rose" />
            <Field label="Refunded" value={paiseToInr(row.refundedPaise)} />
            <Field
              label="Refundable balance"
              value={paiseToInr(row.refundableBalancePaise)}
              accent="strong"
            />
          </div>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold text-white">Quick actions</h3>
            <DepositRowActions row={row} />
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold text-white">Manage deposit</h3>
            <p className="text-xs text-apg-silver">
              Record collections, deductions, refunds, and view full ledger history on the deposit
              detail page.
            </p>
            <Link
              href={`/admin/deposits/${row.bookingId}`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-3 text-sm font-semibold text-white hover:brightness-110"
            >
              Open deposit management →
            </Link>
            <Link
              href={`/admin/residents/${row.customerId}`}
              className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-apg-silver hover:text-white"
            >
              Resident profile
            </Link>
          </section>
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
  accent?: 'emerald' | 'amber' | 'rose' | 'strong';
}) {
  const valueClass =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'amber'
        ? 'text-amber-200'
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
