import { addDays, formatDate, todayString } from '@/src/lib/dates';
import type { PricingMode } from '@/src/services/pricing';

type Props = {
  /** Where the form GETs to. Usually the current pathname. */
  action: string;
  startDate: string;
  endDate: string;
  durationMode: PricingMode;
  /** Optional hidden fields propagated on submit (e.g. preselected bed ids). */
  hidden?: Record<string, string | string[] | undefined>;
};

const MODES: Array<{ value: PricingMode; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'open_ended', label: 'Open ended' },
];

/**
 * Pure GET form. No JS required: when the user changes dates / mode and hits
 * "Update", the page re-renders with the new search params, which is enough
 * for availability + pricing to recompute server-side.
 */
export function DateRangeBar({
  action,
  startDate,
  endDate,
  durationMode,
  hidden,
}: Props) {
  const today = todayString();
  const minCheckOut = formatDate(addDays(startDate, 1));

  return (
    <form
      method="GET"
      action={action}
      className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Check-in
        <input
          type="date"
          name="start"
          defaultValue={startDate}
          min={today}
          required
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Check-out
        <input
          type="date"
          name="end"
          defaultValue={endDate}
          min={minCheckOut}
          disabled={durationMode === 'open_ended'}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Stay type
        <select
          name="mode"
          defaultValue={durationMode}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          className="h-9 w-full rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 sm:w-auto"
        >
          Update
        </button>
      </div>
      {hidden
        ? Object.entries(hidden).flatMap(([name, value]) => {
            if (value == null) return [];
            const arr = Array.isArray(value) ? value : [value];
            return arr.map((v, i) => (
              <input key={`${name}-${i}`} type="hidden" name={name} value={v} />
            ));
          })
        : null}
    </form>
  );
}
