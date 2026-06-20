'use client';

import type { PgRoomTypeSummary } from '@/src/lib/booking/pgRoomTypeSummaries';
import { PG_ROOM_TYPE_LABEL } from '@/src/lib/booking/pgRoomTypeSummaries';
import { paiseToInr } from '@/src/lib/format';

function formatPriceRange(min: number, max: number): string {
  if (min <= 0 && max <= 0) return '—';
  if (min === max || max <= 0) return `${paiseToInr(min || max)} / month`;
  return `${paiseToInr(min)} – ${paiseToInr(max)} / month`;
}

type Props = {
  summaries: PgRoomTypeSummary[];
  active: string | 'all';
  onSelect: (roomTypeKey: string) => void;
};

export function PgRoomTypeCards({ summaries, active, onSelect }: Props) {
  if (summaries.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-[17px] font-semibold text-white">Room types</h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {summaries.map((row) => {
          const label =
            row.roomType === 'single' || row.roomType === 'shared'
              ? PG_ROOM_TYPE_LABEL[row.roomType as 'single' | 'shared']
              : row.roomType;
          const selected = active === row.roomType;
          return (
            <li key={row.roomType}>
              <button
                type="button"
                onClick={() => onSelect(row.roomType)}
                className={
                  'flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3.5 text-left transition ' +
                  (selected
                    ? 'border-apg-orange/45 bg-apg-orange/[0.08]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20')
                }
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-white">{label}</p>
                  <p className="mt-1 text-sm font-medium text-apg-orange">
                    {formatPriceRange(row.minPricePaise, row.maxPricePaise)}
                  </p>
                </div>
                <span className="shrink-0 rounded-[10px] bg-apg-orange px-3 py-1.5 text-[13px] font-semibold text-white">
                  Select
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
