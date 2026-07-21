/** Cache key namespaces — Awesome PG only (never Capital / financial transactions). */

export const CACHE_VERSION = 'v1';

export const cacheTtl = {
  /** Public PG browse + homepage */
  publicPgList: 10 * 60,
  publicPgDetail: 10 * 60,
  publicRooms: 10 * 60,
  publicRoomDetail: 10 * 60,
  /** Admin dashboard KPI aggregates */
  adminDashboardStats: 5 * 60,
  adminBusinessMetrics: 5 * 60,
  adminVisitorSummary: 10 * 60,
} as const;

const prefix = `apg:${CACHE_VERSION}`;

export const cacheKeys = {
  publicPgList: () => `${prefix}:public:pg-list`,
  publicPgBySlug: (slug: string) => `${prefix}:public:pg:slug:${slug}`,
  publicRoomsForPg: (pgId: string, refDate: string) =>
    `${prefix}:public:rooms:${pgId}:${refDate}`,
  publicRoomDetail: (pgSlug: string, roomId: string, refDate: string) =>
    `${prefix}:public:room:${pgSlug}:${roomId}:${refDate}`,
  adminDashboardStats: () => `${prefix}:admin:dashboard-stats`,
  adminBusinessMetrics: (billingMonth: string) =>
    `${prefix}:admin:business-metrics:${billingMonth}`,
  adminPgBusinessMetrics: (billingMonth: string) =>
    `${prefix}:admin:pg-business-metrics:${billingMonth}`,
  adminVisitorSummary: () => `${prefix}:admin:visitor-summary`,
} as const;

/** All room list cache keys for a PG (any reference date). */
export function publicRoomsPatternForPg(pgId: string): string {
  return `${prefix}:public:rooms:${pgId}:*`;
}

/** All room detail cache keys for a PG slug (any room / reference date). */
export function publicRoomDetailPatternForSlug(pgSlug: string): string {
  return `${prefix}:public:room:${pgSlug}:*`;
}

/** Pattern for bulk invalidation after PG / pricing / inventory edits. */
export function publicCachePattern(): string {
  return `${prefix}:public:*`;
}

export function adminKpiCachePattern(): string {
  return `${prefix}:admin:*`;
}
