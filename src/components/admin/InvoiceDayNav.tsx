'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  canNavigateNextDay,
  formatSelectedDayLabel,
  resolveSelectedDay,
  selectedDayQueryParam,
  shiftSelectedDay,
} from '@/src/lib/billing/dayNavigation';

export function InvoiceDayNav({ selectedDate }: { selectedDate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const day = resolveSelectedDay(selectedDate);
  const label = formatSelectedDayLabel(day);
  const nextAllowed = canNavigateNextDay(day);

  function navigateToDay(nextDay: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', selectedDayQueryParam(nextDay));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#1A1F27] p-1">
      <button
        type="button"
        onClick={() => navigateToDay(shiftSelectedDay(day, -1))}
        className="rounded-md px-2.5 py-1.5 text-sm text-apg-silver transition hover:bg-white/5 hover:text-white"
        aria-label="Previous day"
      >
        ← Previous Day
      </button>
      <span className="min-w-[11rem] px-2 text-center text-sm font-semibold text-white">{label}</span>
      <button
        type="button"
        onClick={() => nextAllowed && navigateToDay(shiftSelectedDay(day, 1))}
        disabled={!nextAllowed}
        className="rounded-md px-2.5 py-1.5 text-sm text-apg-silver transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Next day"
      >
        Next Day →
      </button>
    </div>
  );
}
