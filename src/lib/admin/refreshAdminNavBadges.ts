/** Client event — AdminLiveRefreshProvider polls /api/admin/live immediately. */
export const ADMIN_BADGES_REFRESH_EVENT = 'admin-badges-refresh';

/** Refresh sidebar + notification badge counts without router.refresh(). */
export function refreshAdminNavBadges(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_BADGES_REFRESH_EVENT));
}
