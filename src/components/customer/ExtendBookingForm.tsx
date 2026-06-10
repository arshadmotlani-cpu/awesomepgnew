'use client';

import { useActionState } from 'react';
import {
  requestExtensionAction,
  type ExtendActionState,
} from '@/app/(customer)/booking/[bookingCode]/extend/actions';

const idleState: ExtendActionState = { status: 'idle' };

export function ExtendBookingForm({
  bookingCode,
  currentCheckout,
  defaultUntilDate,
}: {
  bookingCode: string;
  /** YYYY-MM-DD — used as the `min` on the date input so users can't pick a date <= current. */
  currentCheckout: string;
  defaultUntilDate: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestExtensionAction,
    idleState,
  );

  // The HTML5 `min` attribute is inclusive; we want strictly-after, so we
  // bump by one day.
  const minUntil = (() => {
    const d = new Date(currentCheckout + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <input type="hidden" name="bookingCode" value={bookingCode} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            New check-out date
          </span>
          <input
            type="date"
            name="newUntilDate"
            required
            min={minUntil}
            defaultValue={defaultUntilDate}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            Must be after {currentCheckout}.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Duration mode
          </span>
          <select
            name="durationMode"
            defaultValue="daily"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <span className="mt-1 block text-[11px] text-zinc-500">
            How we&apos;ll bill the extension.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {pending ? 'Reserving extension…' : 'Reserve & continue to payment'}
      </button>

      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.message}
        </p>
      ) : null}

      {state.status === 'conflict' ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">{state.message}</p>
          {state.conflicts.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {state.conflicts.map((c, i) => (
                <li key={`${c.bedId}-${i}`}>
                  Bed{' '}
                  <span className="font-mono">{c.bedCode}</span> is booked
                  through {c.blockingUntil}
                  {c.blockingBookingCode
                    ? ` (booking ${c.blockingBookingCode})`
                    : ''}
                  .
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-amber-800">
            Try a shorter extension that ends before the first conflict.
          </p>
        </div>
      ) : null}
    </form>
  );
}
