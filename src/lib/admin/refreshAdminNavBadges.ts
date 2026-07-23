/** Client event — AdminLiveRefreshProvider polls /api/admin/live immediately. */
export const ADMIN_BADGES_REFRESH_EVENT = 'admin-badges-refresh';

/** Fired after AdminLiveRefreshProvider finishes a badge poll. */
export const ADMIN_BADGES_REFRESH_COMPLETE_EVENT = 'admin-badges-refresh-complete';

/** Refresh sidebar + notification badge counts without router.refresh(). */
export function refreshAdminNavBadges(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  return new Promise((resolve) => {
    const onComplete = () => {
      window.removeEventListener(ADMIN_BADGES_REFRESH_COMPLETE_EVENT, onComplete);
      resolve();
    };
    window.addEventListener(ADMIN_BADGES_REFRESH_COMPLETE_EVENT, onComplete);
    window.dispatchEvent(new CustomEvent(ADMIN_BADGES_REFRESH_EVENT));
  });
}
