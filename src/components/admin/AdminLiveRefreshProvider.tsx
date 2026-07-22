'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ADMIN_BADGES_REFRESH_EVENT } from '@/src/lib/admin/refreshAdminNavBadges';
import type { AdminNavBadges } from '@/src/services/adminNavBadges';

const BADGE_POLL_MS = 60_000;

const AdminBadgesContext = createContext<AdminNavBadges>({});

export function useAdminNavBadges(): AdminNavBadges {
  return useContext(AdminBadgesContext);
}

/**
 * Polls sidebar badge counts client-side only.
 * Does not call router.refresh() — that raced with Link navigation and blocked clicks
 * while the dynamic admin layout re-suspended.
 */
export function AdminLiveRefreshProvider({
  initialBadges,
  children,
}: {
  initialBadges: AdminNavBadges;
  children: ReactNode;
}) {
  const [badges, setBadges] = useState<AdminNavBadges>(initialBadges);

  const pollBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/live', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok: boolean;
        badges?: AdminNavBadges;
        unreadCount?: number;
      };
      if (!json.ok || !json.badges) return;
      setBadges(json.badges);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('admin-badges-updated', {
            detail: { unreadCount: json.unreadCount ?? json.badges?.notifications ?? 0 },
          }),
        );
      }
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    setBadges(initialBadges);
  }, [initialBadges]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') void pollBadges();
    };

    void pollBadges();

    const badgeTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pollBadges();
    }, BADGE_POLL_MS);

    const onBadgesRefresh = () => {
      void pollBadges();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(ADMIN_BADGES_REFRESH_EVENT, onBadgesRefresh);

    return () => {
      window.clearInterval(badgeTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ADMIN_BADGES_REFRESH_EVENT, onBadgesRefresh);
    };
  }, [pollBadges]);

  const value = useMemo(() => badges, [badges]);

  return <AdminBadgesContext.Provider value={value}>{children}</AdminBadgesContext.Provider>;
}
