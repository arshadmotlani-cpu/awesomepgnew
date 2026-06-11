'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  submitVacatingAction,
  type VacatingActionState,
} from '@/app/(customer)/account/resident/actions';
import { defaultVacatingDate } from '@/src/lib/dateDefaults';
import { todayString } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

const idleState: VacatingActionState = { status: 'idle' };

export function VacatingRequestForm({
  bookingId,
  monthlyRentPaise,
}: {
  bookingId: string;
  monthlyRentPaise: number;
}) {
  const [state, action, pending] = useActionState(submitVacatingAction, idleState);
  const [vacatingDate, setVacatingDate] = useState(defaultVacatingDate);

  const compliant = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)) return null;
    const today = todayString();
    const days = Math.round(
      (new Date(vacatingDate + 'T00:00:00Z').getTime() -
        new Date(today + 'T00:00:00Z').getTime()) /
        86_400_000,
    );
    return { days, compliant: days >= VACATING_NOTICE_MIN_DAYS };
  }, [vacatingDate]);

  const dailyRate = Math.floor(monthlyRentPaise / 30);
  const penalty = dailyRate * 5;

  return (
    <form
      action={action}
      data-roachie-focus="vacating"
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <input type="hidden" name="bookingId" value={bookingId} />

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Vacating date
        </span>
        <input
          type="date"
          name="vacatingDate"
          required
          min={todayString()}
          value={vacatingDate}
          onChange={(e) => setVacatingDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      {compliant ? (
        <div
          className={`rounded-md px-3 py-2 text-sm ring-1 ring-inset ${
            compliant.compliant
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              : 'bg-rose-50 text-rose-800 ring-rose-200'
          }`}
        >
          {compliant.compliant
            ? `Notice: ${compliant.days} days — no deposit deduction.`
            : `Notice: ${compliant.days} day(s) — short of ${VACATING_NOTICE_MIN_DAYS}. A fixed ${paiseToInr(
                penalty,
              )} (5 × ${paiseToInr(dailyRate)}/day) will be deducted from your deposit.`}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:bg-zinc-400"
      >
        {pending ? 'Submitting…' : 'Submit vacating request'}
      </button>

      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
