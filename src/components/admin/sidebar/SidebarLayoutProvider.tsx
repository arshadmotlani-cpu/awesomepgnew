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
};

const SidebarLayoutContext = createContext<SidebarLayoutContextValue | null>(null);

const LOCAL_MUTATION_GUARD_MS = 2000;

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

  const markLocalSidebarMutation = useCallback(() => {
    lastLocalMutationAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (persistInFlightRef.current) return;
    if (Date.now() - lastLocalMutationAtRef.current < LOCAL_MUTATION_GUARD_MS) return;
    setItems(initialItems);
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
  const pinned = items
    .filter((i) => !i.hidden && i.pinned)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const regular = items
    .filter((i) => !i.hidden && !i.pinned)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const hidden = items.filter((i) => i.hidden).sort((a, b) => a.sortOrder - b.sortOrder);
  return [...pinned, ...regular, ...hidden].map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}

export function usePersistSidebarLayout() {
  const {
    items,
    setItems,
    setDragEnabled,
    persistInFlightRef,
    markLocalSidebarMutation,
  } = useSidebarLayout();

  const persist = useCallback(
    async (nextItems: SidebarNavItem[]) => {
      const normalized = reassignSidebarSortOrders(nextItems);
      const previous = items;
      markLocalSidebarMutation();
      setItems(normalized);
      persistInFlightRef.current = true;
      const { persistSidebarLayoutAction } = await import(
        '@/app/(admin)/admin/actions/sidebarLayout'
      );

      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await persistSidebarLayoutAction(entriesFromItems(normalized));
          if (result.ok) return true;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
        }

        setItems(previous);
        setDragEnabled(false);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('sidebar-persist-failed', {
              detail: { message: 'Could not save sidebar order — drag disabled.' },
            }),
          );
        }
        return false;
      } finally {
        persistInFlightRef.current = false;
      }
    },
    [items, setItems, setDragEnabled, persistInFlightRef, markLocalSidebarMutation],
  );

  return persist;
}
