export const UNIFIED_TIMELINE_CATEGORIES = [
  'visit',
  'bill',
  'payment',
  'wallet',
  'loyalty',
  'note',
  'profile',
  'other',
] as const;

export type UnifiedTimelineCategory = (typeof UNIFIED_TIMELINE_CATEGORIES)[number];

export type UnifiedTimelineFilter =
  | 'all'
  | 'visits'
  | 'bills'
  | 'payments'
  | 'wallet'
  | 'loyalty';

export type UnifiedTimelineEvent = {
  id: string;
  occurredAt: Date;
  category: UnifiedTimelineCategory;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  amountPaise?: number;
};

export type CustomerFinancialSummary = {
  duePaise: number;
  advancePaise: number;
  walletPaise: number;
  activeMembership?: {
    id: string;
    planName: string;
    expiresOn: string;
  } | null;
  activePackage?: {
    id: string;
    planName: string;
    remainingSessions: number;
    expiresOn: string | null;
  } | null;
};

const FILTER_TO_CATEGORIES: Record<Exclude<UnifiedTimelineFilter, 'all'>, UnifiedTimelineCategory[]> =
  {
    visits: ['visit'],
    bills: ['bill'],
    payments: ['payment'],
    wallet: ['wallet'],
    loyalty: ['loyalty'],
  };

export function sortUnifiedTimeline(events: UnifiedTimelineEvent[]): UnifiedTimelineEvent[] {
  return [...events].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || a.id.localeCompare(b.id),
  );
}

export function filterUnifiedTimeline(
  events: UnifiedTimelineEvent[],
  filter: UnifiedTimelineFilter,
): UnifiedTimelineEvent[] {
  if (filter === 'all') return events;
  const categories = FILTER_TO_CATEGORIES[filter];
  return events.filter((e) => categories.includes(e.category));
}

export const DEFAULT_TIMELINE_PAGE_SIZE = 50;

export function paginateUnifiedTimeline(
  events: UnifiedTimelineEvent[],
  opts?: { limit?: number; offset?: number },
): UnifiedTimelineEvent[] {
  const limit = Math.max(1, opts?.limit ?? DEFAULT_TIMELINE_PAGE_SIZE);
  const offset = Math.max(0, opts?.offset ?? 0);
  return events.slice(offset, offset + limit);
}
