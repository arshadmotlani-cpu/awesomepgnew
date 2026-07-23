'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ADMIN_BADGES_REFRESH_COMPLETE_EVENT,
  ADMIN_BADGES_REFRESH_EVENT,
} from '@/src/lib/admin/refreshAdminNavBadges';
import type { AdminNavBadges } from '@/src/services/adminNavBadges';

const BADGE_POLL_MS = 60_000;

const AdminBadgesContext = createContext<AdminNavBadges>({});

export function useAdminNavBadges(): AdminNavBadges {
  return useContext(AdminBadgesContext);
}

function operationsBadgeCount(badges: AdminNavBadges): number {
  return badges.operations ?? badges.overview ?? 0;
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
  const lastPollRef = useRef<{ badges: AdminNavBadges; at: number } | null>(null);

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
      lastPollRef.current = { badges: json.badges, at: Date.now() };
      setBadges(json.badges);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('admin-badges-updated', {
            detail: { unreadCount: json.unreadCount ?? json.badges?.notifications ?? 0 },
          }),
        );
        window.dispatchEvent(new CustomEvent(ADMIN_BADGES_REFRESH_COMPLETE_EVENT));
      }
    } catch {
      // ignore transient network errors
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ADMIN_BADGES_REFRESH_COMPLETE_EVENT));
      }
    }
  }, []);

  useEffect(() => {
    const polled = lastPollRef.current;
    if (!polled) {
      setBadges(initialBadges);
      return;
    }

    const polledOps = operationsBadgeCount(polled.badges);
    const nextOps = operationsBadgeCount(initialBadges);
    // Never let stale layout SSR inflate counts after a fresher poll.
    if (nextOps <= polledOps) {
      setBadges(initialBadges);
      lastPollRef.current = { badges: initialBadges, at: Date.now() };
    }
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
