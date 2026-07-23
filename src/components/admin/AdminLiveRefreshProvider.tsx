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
import { usePathname } from 'next/navigation';
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

function mergeBadgesPreferLowerOperations(
  current: AdminNavBadges,
  incoming: AdminNavBadges,
): AdminNavBadges {
  const currentOps = operationsBadgeCount(current);
  const incomingOps = operationsBadgeCount(incoming);
  if (currentOps > 0 && incomingOps > 0 && incomingOps > currentOps) {
    return { ...incoming, operations: currentOps, overview: currentOps };
  }
  return incoming;
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
  const pathname = usePathname();
  const [badges, setBadges] = useState<AdminNavBadges>(initialBadges);
  const hasPolledRef = useRef(false);

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
      hasPolledRef.current = true;
      setBadges((prev) => mergeBadgesPreferLowerOperations(prev, json.badges!));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('admin-badges-updated', {
            detail: { unreadCount: json.unreadCount ?? json.badges?.notifications ?? 0 },
          }),
        );
        window.dispatchEvent(new CustomEvent(ADMIN_BADGES_REFRESH_COMPLETE_EVENT));
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ADMIN_BADGES_REFRESH_COMPLETE_EVENT));
      }
    }
  }, []);

  useEffect(() => {
    if (!hasPolledRef.current) {
      setBadges(initialBadges);
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

  useEffect(() => {
    void pollBadges();
  }, [pathname, pollBadges]);

  const value = useMemo(() => badges, [badges]);

  return <AdminBadgesContext.Provider value={value}>{children}</AdminBadgesContext.Provider>;
}
