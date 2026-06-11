import { addDays, formatDate, todayString } from '@/src/lib/dates';
import type { PricingMode } from '@/src/services/pricing';

type Props = {
  action: string;
  startDate: string;
  endDate: string;
  durationMode: PricingMode;
  hidden?: Record<string, string | string[] | undefined>;
  theme?: 'dark' | 'light';
};

const MODES: Array<{ value: PricingMode; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'open_ended', label: 'Open ended' },
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
  const minCheckOut = formatDate(addDays(startDate, 1));
  const dark = theme === 'dark';

  const shell = dark
    ? 'rounded-2xl border border-white/10 apg-glass p-4'
    : 'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm';
  const label = dark ? 'text-xs font-medium text-apg-silver' : 'text-xs font-medium text-zinc-600';
  const input = dark
    ? 'apg-input-dark h-10 w-full rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50'
    : 'h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400';
  const btn = dark
    ? 'h-10 rounded-lg bg-apg-orange px-5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110'
    : 'h-9 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500';

  return (
    <form
      method="GET"
      action={action}
      className={`grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] ${shell}`}
    >
      <label className={`flex flex-col gap-1 ${label}`}>
        Check-in
        <input type="date" name="start" defaultValue={startDate} min={today} required className={input} />
      </label>
      <label className={`flex flex-col gap-1 ${label}`}>
        Check-out
        <input
          type="date"
          name="end"
          defaultValue={endDate}
          min={minCheckOut}
          disabled={durationMode === 'open_ended'}
          className={input}
        />
      </label>
      <label className={`flex flex-col gap-1 ${label}`}>
        Stay type
        <select name="mode" defaultValue={durationMode} className={input}>
          {MODES.map((m) => (
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
