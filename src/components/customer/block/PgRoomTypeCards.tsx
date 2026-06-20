'use client';

import {
  PG_CATEGORY_META,
  pgDisplayCategory,
  type PgDisplayCategory,
} from '@/src/components/customer/block/pgDisplayCategory';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { paiseToInr } from '@/src/lib/format';

const ORDER: PgDisplayCategory[] = ['single', 'shared'];

function monthlyRange(
  rooms: CustomerRoomCard[],
  id: PgDisplayCategory,
): { min: number; max: number } {
  const rates = rooms
    .filter((r) => pgDisplayCategory(r.capacity) === id && r.monthlyRatePaise > 0)
    .map((r) => r.monthlyRatePaise);
  if (rates.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...rates), max: Math.max(...rates) };
}

function formatPriceRange(min: number, max: number): string | null {
  if (min <= 0 && max <= 0) return null;
  if (min === max || max <= 0) return `${paiseToInr(min || max)} / month`;
  return `${paiseToInr(min)} – ${paiseToInr(max)} / month`;
}

type Props = {
  rooms: CustomerRoomCard[];
  active: PgDisplayCategory | 'all';
  onSelect: (id: PgDisplayCategory) => void;
};

export function PgRoomTypeCards({ rooms, active, onSelect }: Props) {
  const present = ORDER.filter((id) =>
    rooms.some((r) => pgDisplayCategory(r.capacity) === id),
  );
  if (present.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-[17px] font-semibold text-white">Room types</h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {present.map((id) => {
          const meta = PG_CATEGORY_META[id];
          const { min, max } = monthlyRange(rooms, id);
          const priceLabel = formatPriceRange(min, max);
          const selected = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={
                  'flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3.5 text-left transition ' +
                  (selected
                    ? 'border-apg-orange/45 bg-apg-orange/[0.08]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20')
                }
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-white">
                    <span className="mr-1.5" aria-hidden>
                      {meta.icon}
                    </span>
                    {meta.title}
                  </p>
                  {priceLabel ? (
                    <p className="mt-1 text-sm font-medium text-apg-orange">{priceLabel}</p>
                  ) : null}
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
