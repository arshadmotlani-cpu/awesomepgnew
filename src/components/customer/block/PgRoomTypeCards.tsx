'use client';

import {
  PG_CATEGORY_META,
  pgDisplayCategory,
  type PgDisplayCategory,
} from '@/src/components/customer/block/pgDisplayCategory';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { paiseToInr } from '@/src/lib/format';

const ORDER: PgDisplayCategory[] = ['single', 'shared'];

function lowestMonthly(rooms: CustomerRoomCard[], id: PgDisplayCategory): number {
  const rates = rooms
    .filter((r) => pgDisplayCategory(r.capacity) === id && r.monthlyRatePaise > 0)
    .map((r) => r.monthlyRatePaise);
  return rates.length > 0 ? Math.min(...rates) : 0;
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
    <section className="mt-6 px-0">
      <h2 className="text-[17px] font-semibold text-white">Room types</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {present.map((id) => {
          const meta = PG_CATEGORY_META[id];
          const monthly = lowestMonthly(rooms, id);
          const selected = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={
                  'flex w-full items-center gap-3 rounded-[16px] border p-4 text-left shadow-sm transition ' +
                  (selected
                    ? 'border-apg-orange/45 bg-apg-orange/[0.08]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20')
                }
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.06] text-xl"
                  aria-hidden
                >
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-white">{meta.title}</p>
                  <p className="mt-0.5 text-xs text-apg-muted">{meta.description}</p>
                  {monthly > 0 ? (
                    <p className="mt-1.5 text-sm font-semibold text-apg-orange">
                      {paiseToInr(monthly)}/mo
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-[12px] bg-apg-orange px-3.5 py-2 text-[13px] font-semibold text-white">
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
