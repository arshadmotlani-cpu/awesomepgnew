'use client';

import Link from 'next/link';
import { useState } from 'react';
import { submitDepositDueExtensionRequestAction } from '@/app/(customer)/account/resident/deposit-actions';
import { paiseToInr, formatDate } from '@/src/lib/format';
import {
  labelDepositCollectionStatus,
  hasOutstandingDepositDue,
} from '@/src/lib/depositCollectionLabels';
import type { DepositCollectionStatus } from '@/src/db/schema/enums';

type Props = {
  bookingId: string;
  bookingCode: string;
  pgName: string;
  depositPaise: number;
  collectedPaise: number;
  depositDuePaise: number;
  depositDueDate: string | null;
  depositCollectionStatus: DepositCollectionStatus;
  paymentLinkUrl?: string | null;
};

export function DepositDueSection({
  bookingId,
  bookingCode,
  pgName,
  depositPaise,
  collectedPaise,
  depositDuePaise,
  depositDueDate,
  depositCollectionStatus,
  paymentLinkUrl,
}: Props) {
  const [extensionDate, setExtensionDate] = useState('');
  const [extensionMsg, setExtensionMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!hasOutstandingDepositDue({ depositCollectionStatus, depositDuePaise })) {
    if (depositPaise > 0 && depositCollectionStatus === 'full') {
      return (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 ring-1 ring-emerald-100">
          <h3 className="text-sm font-semibold text-emerald-900">Security deposit</h3>
          <p className="mt-1 text-xs text-emerald-800">
            {paiseToInr(depositPaise)} paid in full for booking {bookingCode}.
          </p>
        </section>
      );
    }
    return null;
  }

  const isOverdue = depositCollectionStatus === 'overdue';

  async function requestExtension() {
    if (!extensionDate) {
      setExtensionMsg('Pick a new due date.');
      return;
    }
    setPending(true);
    setExtensionMsg(null);
    const fd = new FormData();
    fd.set('bookingId', bookingId);
    fd.set('requestedDueDate', extensionDate);
    const result = await submitDepositDueExtensionRequestAction(fd);
    setPending(false);
    setExtensionMsg(result.ok ? 'Extension request submitted.' : result.error ?? 'Failed.');
  }

  return (
    <section
      className={
        'rounded-xl border p-5 ring-1 ' +
        (isOverdue
          ? 'border-rose-300 bg-rose-50/80 ring-rose-200'
          : 'border-amber-200 bg-amber-50/80 ring-amber-100')
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-900">
          Security deposit — {pgName}
        </h3>
        <span
          className={
            'rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ' +
            (isOverdue ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900')
          }
        >
          {labelDepositCollectionStatus(depositCollectionStatus)}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Deposit required</dt>
          <dd className="font-semibold text-zinc-900">{paiseToInr(depositPaise)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Deposit paid</dt>
          <dd className="font-semibold text-emerald-800">{paiseToInr(collectedPaise)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Deposit due</dt>
          <dd className="font-semibold text-rose-800">{paiseToInr(depositDuePaise)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Due date</dt>
          <dd className="font-semibold text-zinc-900">
            {depositDueDate ? formatDate(depositDueDate) : '—'}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-zinc-700">
        Remaining deposit must be paid
        {depositDueDate ? ` by ${formatDate(depositDueDate)}` : ''} to stay in good standing.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {paymentLinkUrl ? (
          <Link
            href={paymentLinkUrl}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Pay now
          </Link>
        ) : (
          <Link
            href={`/account/profile?section=resident&booking=${bookingId}`}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Contact office to pay
          </Link>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white/80 p-3">
        <p className="text-xs font-semibold text-zinc-800">Request extension</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-zinc-600">
            New due date
            <input
              type="date"
              value={extensionDate}
              onChange={(e) => setExtensionDate(e.target.value)}
              className="mt-1 block rounded border border-zinc-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => void requestExtension()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pending ? 'Submitting…' : 'Request extension'}
          </button>
        </div>
        {extensionMsg ? (
          <p className="mt-2 text-[11px] text-zinc-600">{extensionMsg}</p>
        ) : null}
      </div>
    </section>
  );
}
