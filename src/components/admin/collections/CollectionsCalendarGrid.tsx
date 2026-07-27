import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { CollectionsCalendarDay } from '@/src/services/collectionsCalendar';

function weekdayLabels() {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
}

/** Monday-first index for ISO-ish calendar (UTC date string). */
function mondayIndex(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const js = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Sun
  return js === 0 ? 6 : js - 1;
}

export function CollectionsCalendarGrid({
  month,
  days,
  selectedDate,
}: {
  month: string;
  days: CollectionsCalendarDay[];
  selectedDate?: string;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = `${month}-01`;
  const lead = mondayIndex(first);
  const cells: Array<CollectionsCalendarDay | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (const day of days) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
        {weekdayLabels().map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="min-h-[72px] rounded-lg bg-transparent" />;
          }
          const dayNum = Number(day.date.slice(-2));
          const hasActivity =
            day.dueCount + day.paidCount + day.awaitingCount + day.upcomingCount > 0;
          const isSelected = selectedDate === day.date;
          return (
            <Link
              key={day.date}
              href={`/admin/collections?view=calendar&month=${month}&day=${day.date}`}
              className={
                'min-h-[72px] rounded-lg border p-2 text-left transition ' +
                (isSelected
                  ? 'border-[#FF5A1F] bg-[#FF5A1F]/15'
                  : hasActivity
                    ? 'border-white/15 bg-[#1A1F27] hover:border-white/30'
                    : 'border-white/5 bg-[#12151a] hover:border-white/10')
              }
            >
              <div className="text-xs font-semibold text-white">{dayNum}</div>
              {day.dueCount > 0 ? (
                <div className="mt-1 text-[10px] text-rose-300">
                  Due {day.dueCount} · {paiseToInr(day.duePaise)}
                </div>
              ) : null}
              {day.paidCount > 0 ? (
                <div className="text-[10px] text-emerald-300">Paid {day.paidCount}</div>
              ) : null}
              {day.upcomingCount > 0 ? (
                <div className="text-[10px] text-apg-silver">Up {day.upcomingCount}</div>
              ) : null}
              {day.awaitingCount > 0 ? (
                <div className="text-[10px] text-amber-200">Proof {day.awaitingCount}</div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
