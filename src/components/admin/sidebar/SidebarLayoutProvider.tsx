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
import type { AdminModule } from '@/src/lib/admin/navigation';
import type { SidebarModuleKey } from '@/src/lib/admin/sidebarModules';
import type { AdminNavBadges } from '@/src/services/adminNavBadges';
import { sidebarOrderFingerprint } from '@/src/components/admin/sidebar/sidebarOrder';

export type SidebarNavItem = {
  key: SidebarModuleKey;
  label: string;
  href: string;
  module?: AdminModule;
  badgeKey?: keyof AdminNavBadges;
  sortOrder: number;
  hidden: boolean;
  pinned: boolean;
};

type SidebarLayoutContextValue = {
  items: SidebarNavItem[];
  setItems: (items: SidebarNavItem[]) => void;
  isSuperAdmin: boolean;
  dragEnabled: boolean;
  setDragEnabled: (enabled: boolean) => void;
  markLocalSidebarMutation: () => void;
  persistInFlightRef: { current: boolean };
  confirmedOrderFingerprintRef: { current: string };
};

const SidebarLayoutContext = createContext<SidebarLayoutContextValue | null>(null);

const LOCAL_MUTATION_GUARD_MS = 2500;

export function SidebarLayoutProvider({
  initialItems,
  isSuperAdmin,
  children,
}: {
  initialItems: SidebarNavItem[];
  isSuperAdmin: boolean;
  children: ReactNode;
}) {
  const [items, setItems] = useState(initialItems);
  const [dragEnabled, setDragEnabled] = useState(true);
  const lastLocalMutationAtRef = useRef(0);
  const persistInFlightRef = useRef(false);
  const confirmedOrderFingerprintRef = useRef(sidebarOrderFingerprint(initialItems));
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const markLocalSidebarMutation = useCallback(() => {
    lastLocalMutationAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (persistInFlightRef.current) return;

    const serverFp = sidebarOrderFingerprint(initialItems);
    const localFp = sidebarOrderFingerprint(itemsRef.current);
    const withinGuard =
      Date.now() - lastLocalMutationAtRef.current < LOCAL_MUTATION_GUARD_MS;

    // Server caught up to what we just saved — adopt quietly.
    if (serverFp === confirmedOrderFingerprintRef.current) {
      if (serverFp !== localFp) setItems(initialItems);
      return;
    }

    // During/after a local drag, ignore stale server props that still have the old order.
    if (withinGuard) return;

    if (serverFp !== localFp) {
      setItems(initialItems);
      confirmedOrderFingerprintRef.current = serverFp;
    }
  }, [initialItems]);

  const value = useMemo(
    () => ({
      items,
      setItems,
      isSuperAdmin,
      dragEnabled,
      setDragEnabled,
      markLocalSidebarMutation,
      persistInFlightRef,
      confirmedOrderFingerprintRef,
    }),
    [items, isSuperAdmin, dragEnabled, markLocalSidebarMutation],
  );

  return (
    <SidebarLayoutContext.Provider value={value}>{children}</SidebarLayoutContext.Provider>
  );
}

export function useSidebarLayout(): SidebarLayoutContextValue {
  const ctx = useContext(SidebarLayoutContext);
  if (!ctx) {
    throw new Error('useSidebarLayout must be used within SidebarLayoutProvider');
  }
  return ctx;
}

/** @deprecated use useSidebarLayout */
export function useSidebarLayoutItems(): SidebarNavItem[] {
  return useSidebarLayout().items.filter((item) => !item.hidden);
}

export function entriesFromItems(items: SidebarNavItem[]) {
  return items.map((item, index) => ({
    moduleKey: item.key,
    sortOrder: index,
    hidden: item.hidden,
    pinned: item.pinned,
  }));
}

export function reassignSidebarSortOrders(items: SidebarNavItem[]): SidebarNavItem[] {
  const seen = new Set<SidebarNavItem['key']>();
  const deduped = items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });

  const pinned = deduped
    .filter((i) => !i.hidden && i.pinned)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const regular = deduped
    .filter((i) => !i.hidden && !i.pinned)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const hidden = deduped.filter((i) => i.hidden).sort((a, b) => a.sortOrder - b.sortOrder);
  return [...pinned, ...regular, ...hidden].map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}

export function usePersistSidebarLayout() {
  const {
    setItems,
    setDragEnabled,
    persistInFlightRef,
    markLocalSidebarMutation,
    confirmedOrderFingerprintRef,
  } = useSidebarLayout();
  const rollbackItemsRef = useRef<SidebarNavItem[] | null>(null);

  const persist = useCallback(
    async (nextItems: SidebarNavItem[], previousItems: SidebarNavItem[]) => {
      const normalized = reassignSidebarSortOrders(nextItems);
      const fingerprint = sidebarOrderFingerprint(normalized);
      rollbackItemsRef.current = previousItems;
      markLocalSidebarMutation();
      setItems(normalized);
      persistInFlightRef.current = true;
      const { persistSidebarLayoutAction } = await import(
        '@/app/(admin)/admin/actions/sidebarLayout'
      );

      try {
        let lastError: string | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await persistSidebarLayoutAction(entriesFromItems(normalized));
          if (result.ok) {
            confirmedOrderFingerprintRef.current = fingerprint;
            return true;
          }
          lastError = result.error;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
        }

        const rollback = rollbackItemsRef.current;
        if (rollback) setItems(rollback);
        setDragEnabled(false);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('sidebar-persist-failed', {
              detail: {
                message:
                  lastError ??
                  'Could not save sidebar order — drag disabled. Click Retry drag to try again.',
              },
            }),
          );
        }
        return false;
      } finally {
        persistInFlightRef.current = false;
        rollbackItemsRef.current = null;
      }
    },
    [
      setItems,
      setDragEnabled,
      persistInFlightRef,
      markLocalSidebarMutation,
      confirmedOrderFingerprintRef,
    ],
  );

  return persist;
}
