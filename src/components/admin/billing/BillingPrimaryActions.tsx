'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  generateRentBillsAction,
  type ActionState,
} from '@/app/(admin)/admin/rent/actions';

const idle: ActionState = { status: 'idle' };

const PRIMARY =
  'inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#FF5A1F] px-5 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50';
const SECONDARY =
  'inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 hover:bg-sky-500/20';

export type BillingGenerationStatus = {
  billingMonth: string;
  monthLabel: string;
  rent: {
    statusLabel: string;
    generatedCount: number;
    pendingCount: number;
    candidateCount: number;
  };
  electricity: {
    statusLabel: string;
    roomsNeedingBillCount: number;
    roomsWaitingMeterCount: number;
  };
};

type Props = {
  billingMonth: string;
  canGenerateRent: boolean;
  generationStatus: BillingGenerationStatus;
};

function monthInputValue(billingMonth: string): string {
  return billingMonth.slice(0, 7);
}

function dueDateDefault(billingMonth: string, day = 5): string {
  const [y, m] = billingMonth.slice(0, 7).split('-').map(Number);
  const maxDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const d = Math.min(day, maxDay);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function BillingPrimaryActions({
  billingMonth,
  canGenerateRent,
  generationStatus,
}: Props) {
  const [genState, genAction, genPending] = useActionState(generateRentBillsAction, idle);
  const monthValue = monthInputValue(billingMonth);
  const defaultDueDate = dueDateDefault(billingMonth, 5);
  const { rent, electricity, monthLabel } = generationStatus;

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Billing Center</h2>
      <p className="mt-1 text-sm text-apg-silver">
        Generate and manage monthly PG bills. Rent and electricity always use the canonical billing
        engines — this page only orchestrates them.
      </p>

      {genState.status === 'ok' ? (
        <p className="mt-4 whitespace-pre-line rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {genState.message}
        </p>
      ) : genState.status === 'error' ? (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {genState.message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#12161C] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Rent</h3>
              <p className="mt-0.5 text-xs text-apg-silver">{monthLabel}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-apg-silver">
              {rent.statusLabel}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Generated</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {rent.generatedCount}
              </dd>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Pending</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {rent.pendingCount}
              </dd>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Residents</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {rent.candidateCount}
              </dd>
            </div>
          </dl>
          <form action={genAction} className="mt-4 space-y-3">
            <label className="block text-xs text-apg-silver">
              Billing month
              <input
                type="month"
                name="billingMonthInput"
                defaultValue={monthValue}
                required
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-apg-silver">
              Collection due date
              <input
                type="date"
                name="collectionDueDate"
                defaultValue={defaultDueDate}
                required
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>
            <button type="submit" disabled={genPending || !canGenerateRent} className={PRIMARY}>
              {genPending
                ? 'Generating rent bills…'
                : rent.pendingCount === 0 && rent.generatedCount > 0
                  ? 'Generate Rent Bills (idempotent)'
                  : 'Generate Rent Bills'}
            </button>
            {!canGenerateRent ? (
              <p className="text-[11px] text-amber-200">You need rent:write permission to generate.</p>
            ) : null}
          </form>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12161C] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                Electricity
              </h3>
              <p className="mt-0.5 text-xs text-apg-silver">{monthLabel}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-apg-silver">
              {electricity.statusLabel}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Need bills</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {electricity.roomsNeedingBillCount}
              </dd>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Need meters</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {electricity.roomsWaitingMeterCount}
              </dd>
            </div>
          </dl>
          {electricity.roomsWaitingMeterCount > 0 ? (
            <p className="mt-3 text-xs text-amber-200">
              {electricity.roomsWaitingMeterCount} room
              {electricity.roomsWaitingMeterCount === 1 ? '' : 's'} need meter readings (entered
              during generation).
            </p>
          ) : (
            <p className="mt-3 text-xs text-emerald-200">
              All occupied AC rooms already have an electricity bill for this month.
            </p>
          )}
          <Link
            href={`/admin/billing/electricity/generate?month=${monthValue}`}
            className={`${SECONDARY} mt-4`}
          >
            Generate Electricity Bills →
          </Link>
        </div>
      </div>
    </section>
  );
}
