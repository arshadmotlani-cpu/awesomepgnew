'use client';

import { useMemo, useState } from 'react';
import { addDays, formatDate, todayString } from '@/src/lib/dates';
import {
  defaultCheckOutDate,
  VACATING_NOTICE_MIN_DAYS,
} from '@/src/lib/dateDefaults';
import type { PricingMode } from '@/src/services/pricing';

type Props = {
  action: string;
  startDate: string;
  endDate: string;
  durationMode: PricingMode;
  hidden?: Record<string, string | string[] | undefined>;
  theme?: 'dark' | 'light';
};

type StayIntent = 'fixed' | 'indefinite';

const FIXED_MODES: Array<{ value: PricingMode; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function DateRangeBar({
  action,
  startDate,
  endDate,
  durationMode,
  hidden,
  theme = 'dark',
}: Props) {
  const today = todayString();
  const initialIntent: StayIntent =
    durationMode === 'open_ended' ? 'indefinite' : 'fixed';
  const initialFixedMode: PricingMode =
    durationMode === 'open_ended' ? 'monthly' : durationMode;

  const [intent, setIntent] = useState<StayIntent>(initialIntent);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [fixedMode, setFixedMode] = useState<PricingMode>(initialFixedMode);

  const minCheckOut = formatDate(addDays(start, 1));
  const availabilityEnd = useMemo(
    () => defaultCheckOutDate(start),
    [start],
  );
  const dark = theme === 'dark';

  const shell = dark
    ? 'rounded-2xl border border-white/10 apg-glass p-4'
    : 'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm';
  const label = dark
    ? 'text-xs font-medium text-apg-silver'
    : 'text-xs font-medium text-zinc-600';
  const input = dark
    ? 'apg-input-dark h-10 w-full rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50'
    : 'h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400';
  const btn = dark
    ? 'h-10 rounded-lg bg-apg-orange px-5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110'
    : 'h-9 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500';
  const intentCard = (selected: boolean) =>
    dark
      ? `rounded-xl border px-3 py-2.5 text-left transition-colors ${
          selected
            ? 'border-apg-orange/50 bg-apg-orange/10'
            : 'border-white/10 bg-white/5 hover:border-white/20'
        }`
      : `rounded-lg border px-3 py-2.5 text-left transition-colors ${
          selected
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-zinc-200 bg-white hover:border-zinc-300'
        }`;
  const intentTitle = dark ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-zinc-900';
  const intentCopy = dark ? 'mt-0.5 text-xs text-apg-silver' : 'mt-0.5 text-xs text-zinc-500';
  const notice = dark
    ? 'rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-xs leading-relaxed text-emerald-100'
    : 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-900';

  function handleStartChange(value: string) {
    setStart(value);
    if (intent === 'fixed' && end <= value) {
      setEnd(defaultCheckOutDate(value));
    }
  }

  return (
    <form method="GET" action={action} className={`space-y-4 ${shell}`}>
      <fieldset className="space-y-2">
        <legend className={`${label} mb-1`}>How long are you staying?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={intentCard(intent === 'indefinite')}>
            <input
              type="radio"
              name="stayIntent"
              value="indefinite"
              checked={intent === 'indefinite'}
              onChange={() => setIntent('indefinite')}
              className="sr-only"
            />
            <span className={intentTitle}>Living here — no fixed check-out</span>
            <span className={intentCopy}>
              Book from your move-in date. Stay as long as you like and give{' '}
              {VACATING_NOTICE_MIN_DAYS} days notice when you plan to leave.
            </span>
          </label>
          <label className={intentCard(intent === 'fixed')}>
            <input
              type="radio"
              name="stayIntent"
              value="fixed"
              checked={intent === 'fixed'}
              onChange={() => setIntent('fixed')}
              className="sr-only"
            />
            <span className={intentTitle}>I know my check-out date</span>
            <span className={intentCopy}>
              Pick check-in and check-out for a short stay (daily, weekly, or monthly).
            </span>
          </label>
        </div>
      </fieldset>

      {intent === 'indefinite' ? (
        <>
          <input type="hidden" name="mode" value="open_ended" />
          <input type="hidden" name="end" value={availabilityEnd} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <label className={`flex flex-col gap-1 ${label}`}>
              Move-in date
              <input
                type="date"
                name="start"
                value={start}
                min={today}
                required
                onChange={(e) => handleStartChange(e.target.value)}
                className={input}
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className={`w-full sm:w-auto ${btn}`}>
                Update dates
              </button>
            </div>
          </div>
          <p className={notice}>
            <strong className="font-semibold">Flexible stay.</strong> Your bed is reserved from
            move-in and billed monthly. When you want to leave, submit a vacating request from your
            resident dashboard at least {VACATING_NOTICE_MIN_DAYS} days before your last day.
          </p>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <label className={`flex flex-col gap-1 ${label}`}>
            Check-in
            <input
              type="date"
              name="start"
              value={start}
              min={today}
              required
              onChange={(e) => handleStartChange(e.target.value)}
              className={input}
            />
          </label>
          <label className={`flex flex-col gap-1 ${label}`}>
            Check-out
            <input
              type="date"
              name="end"
              value={end}
              min={minCheckOut}
              required
              onChange={(e) => setEnd(e.target.value)}
              className={input}
            />
          </label>
          <label className={`flex flex-col gap-1 ${label}`}>
            Stay type
            <select
              name="mode"
              value={fixedMode}
              onChange={(e) => setFixedMode(e.target.value as PricingMode)}
              className={input}
            >
              {FIXED_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className={btn}>
              Update dates
            </button>
          </div>
        </div>
      )}

      {hidden
        ? Object.entries(hidden).flatMap(([key, val]) => {
            if (val == null) return [];
            const values = Array.isArray(val) ? val : [val];
            return values.map((v) => (
              <input key={`${key}-${v}`} type="hidden" name={key} value={v} />
            ));
          })
        : null}
    </form>
  );
}
