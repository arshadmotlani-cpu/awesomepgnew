'use client';

import {
  SIMPLE_CATEGORY_META,
  roomCategoryFromCapacity,
  type SimpleRoomCategoryId,
} from '@/src/lib/booking/simpleRoomCategory';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { paiseToInr } from '@/src/lib/format';

const ORDER: SimpleRoomCategoryId[] = ['single', 'shared', 'dormitory'];

const ICON: Record<SimpleRoomCategoryId, string> = {
  single: '🛏',
  shared: '👥',
  dormitory: '🏨',
};

function categoryTitle(id: SimpleRoomCategoryId): string {
  if (id === 'shared') return 'Shared Room';
  return SIMPLE_CATEGORY_META[id].title;
}

function lowestMonthly(rooms: CustomerRoomCard[], id: SimpleRoomCategoryId): number {
  const rates = rooms
    .filter((r) => roomCategoryFromCapacity(r.capacity) === id && r.monthlyRatePaise > 0)
    .map((r) => r.monthlyRatePaise);
  return rates.length > 0 ? Math.min(...rates) : 0;
}

type Props = {
  rooms: CustomerRoomCard[];
  active: SimpleRoomCategoryId | 'all';
  onSelect: (id: SimpleRoomCategoryId) => void;
};

export function PgRoomTypeCards({ rooms, active, onSelect }: Props) {
  const present = ORDER.filter((id) =>
    rooms.some((r) => roomCategoryFromCapacity(r.capacity) === id),
  );
  if (present.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-white">Room types</h2>
      <p className="mt-1 text-sm text-apg-silver">Pick a style, then choose your bed.</p>
      <ul className="mt-4 space-y-3">
        {present.map((id) => {
          const monthly = lowestMonthly(rooms, id);
          const selected = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={
                  'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ' +
                  (selected
                    ? 'border-apg-orange/50 bg-apg-orange/10'
                    : 'border-white/10 apg-glass-light hover:border-white/20')
                }
              >
                <span className="text-2xl" aria-hidden>
                  {ICON[id]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-white">{categoryTitle(id)}</p>
                  <p className="text-sm text-apg-silver">{SIMPLE_CATEGORY_META[id].description}</p>
                  {monthly > 0 ? (
                    <p className="mt-1 text-sm font-semibold text-apg-orange">
                      {paiseToInr(monthly)}/month
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-xl bg-apg-orange px-4 py-2 text-sm font-bold text-white">
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
