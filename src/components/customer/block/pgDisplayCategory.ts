import { roomCategoryFromCapacity } from '@/src/lib/booking/simpleRoomCategory';

/** Customer PG UI — only Single and Shared (dormitory rolls into Shared). */
export type PgDisplayCategory = 'single' | 'shared';

export function pgDisplayCategory(capacity: number): PgDisplayCategory {
  const raw = roomCategoryFromCapacity(capacity);
  return raw === 'dormitory' ? 'shared' : raw;
}

export function matchesPgCategoryFilter(
  capacity: number,
  filter: PgDisplayCategory | 'all',
): boolean {
  if (filter === 'all') return true;
  return pgDisplayCategory(capacity) === filter;
}

export const PG_CATEGORY_META: Record<PgDisplayCategory, { title: string; icon: string }> = {
  single: {
    title: 'Single Room',
    icon: '🛏',
  },
  shared: {
    title: 'Shared Room',
    icon: '👥',
  },
};
