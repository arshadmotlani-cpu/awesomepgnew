'use client';

import { paiseToInr } from '@/src/lib/format';
import { TOUR_EXAMPLE_DATES } from '@/src/lib/cockroach/onboardingSteps';
import { dispatchRoachieReminder } from '@/src/lib/cockroach/roachieReminders';

type Props = {
  sampleMonthlyPaise?: number;
  sampleDepositPaise?: number;
  theme?: 'dark' | 'light';
};

/**
 * Compact education anchors for the Roachie tour — pre-book, reserve, extend,
 * and payment breakdown. Always on the room page so tour steps have targets.
 */
export function BookingEducationBar({
  sampleMonthlyPaise = 12_000_00,
  sampleDepositPaise = 5_000_00,
  theme = 'dark',
}: Props) {
  const dark = theme === 'dark';
  const reservationPaise = Math.round(sampleMonthlyPaise * 0.5);
  const totalPaise = reservationPaise + sampleDepositPaise;

  const shell = dark
    ? 'rounded-2xl border border-white/10 apg-glass-light'
    : 'rounded-xl border border-zinc-200 bg-zinc-50';
  const label = dark ? 'text-apg-silver' : 'text-zinc-600';
  const heading = dark ? 'text-white' : 'text-zinc-900';

  return (
    <section className={`mt-6 space-y-4 ${shell} p-4 sm:p-5`} aria-label="How booking works">
      <div>
        <h3 className={`text-sm font-semibold ${heading}`}>Quick actions</h3>
        <p className={`mt-1 text-xs ${label}`}>
          These buttons appear on beds depending on availability — here is what they mean.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-roachie-tour="pre-book"
            className={
              dark
                ? 'rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100'
                : 'rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800'
            }
            onClick={() => dispatchRoachieReminder('pre-book')}
          >
            Pre-Book
          </button>
          <button
            type="button"
            data-roachie-tour="reserve"
            className={
              dark
                ? 'rounded-lg border border-apg-orange/50 bg-apg-orange/20 px-3 py-2 text-xs font-semibold text-white'
                : 'rounded-md border border-indigo-400 bg-indigo-600 px-3 py-2 text-xs font-semibold text-white'
            }
            onClick={() => dispatchRoachieReminder('reserve')}
          >
            Reserve early (50% rent)
          </button>
        </div>
      </div>

      <aside
        data-roachie-tour="payment"
        className={
          dark
            ? 'rounded-xl border border-white/10 bg-white/[0.03] p-4'
            : 'rounded-lg border border-zinc-200 bg-white p-4'
        }
      >
        <h4 className={`text-sm font-semibold ${heading}`}>Payment summary (example)</h4>
        <dl className={`mt-3 space-y-1.5 text-xs ${label}`}>
          <div className="flex justify-between gap-3">
            <dt>Reservation (until {TOUR_EXAMPLE_DATES.moveIn})</dt>
            <dd className={`font-medium ${heading}`}>{paiseToInr(reservationPaise)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Refundable deposit</dt>
            <dd className={`font-medium ${heading}`}>{paiseToInr(sampleDepositPaise)}</dd>
          </div>
        </dl>
        <div
          className={
            dark
              ? 'mt-3 flex items-center justify-between rounded-lg bg-apg-orange/20 px-3 py-2 text-sm text-white'
              : 'mt-3 flex items-center justify-between rounded-md bg-zinc-900 px-3 py-2 text-sm text-white'
          }
        >
          <span className="font-medium">Total due now</span>
          <span className="font-semibold">{paiseToInr(totalPaise)}</span>
        </div>
      </aside>
    </section>
  );
}
