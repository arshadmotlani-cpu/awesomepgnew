'use client';

import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { PgDepositResidentRow } from '@/src/services/pgDepositCollection';

export function ResidentBillingTimelineDrawer({
  open,
  onClose,
  resident,
}: {
  open: boolean;
  onClose: () => void;
  resident: PgDepositResidentRow | null;
}) {
  if (!open || !resident) return null;

  const t = resident.billingTimeline;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#12161C] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{resident.customerName}</h2>
            <p className="text-sm text-apg-silver">
              Room {resident.roomNumber} · {resident.bedCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-sm text-apg-silver hover:text-white"
          >
            Close
          </button>
        </div>

        <dl className="mt-6 space-y-4 text-sm">
          <TimelineRow label="Check-in date" value={formatDate(t.checkInDate)} />
          <TimelineRow label="Rent cycle start" value={formatDate(t.rentCycleStart)} />
          <TimelineRow label="Billing cycle" value={t.billingCycleLabel} />
          <TimelineRow label="Rent due day" value={`${t.billingDay} of each month`} />
          <TimelineRow label="Current billing period" value={t.currentBillingPeriod} />
          <TimelineRow label="Next invoice date" value={formatDate(t.nextInvoiceDate)} />
          <TimelineRow label="Next due date" value={formatDate(t.nextDueDate)} strong />
          <TimelineRow
            label="Monthly rent"
            value={t.monthlyRentPaise > 0 ? paiseToInr(t.monthlyRentPaise) : '—'}
          />
          <TimelineRow
            label="Last invoice"
            value={t.lastInvoiceDate ? formatDate(t.lastInvoiceDate) : '—'}
          />
          <TimelineRow
            label="Last rent payment"
            value={t.lastPaymentDate ? formatDate(t.lastPaymentDate) : '—'}
          />
        </dl>

        <div className="mt-6 rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-xs text-apg-silver">
          <p className="font-medium text-white">Deposit</p>
          <p className="mt-1">
            Required {paiseToInr(resident.requiredDepositPaise)} · Paid{' '}
            {paiseToInr(resident.paidAmountPaise)} · Outstanding{' '}
            {paiseToInr(resident.outstandingPaise)}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/admin/residents/${resident.customerId}`}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Open resident profile
          </Link>
          <Link
            href={`/admin/deposits/${resident.bookingId}`}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5"
          >
            Deposit detail
          </Link>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={`text-right ${strong ? 'font-semibold text-white' : 'text-white'}`}>{value}</dd>
    </div>
  );
}
