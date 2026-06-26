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
};

const SidebarLayoutContext = createContext<SidebarLayoutContextValue | null>(null);

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

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const value = useMemo(
    () => ({ items, setItems, isSuperAdmin, dragEnabled, setDragEnabled }),
    [items, isSuperAdmin, dragEnabled],
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
  const { items, setItems, setDragEnabled } = useSidebarLayout();

  const persist = useCallback(
    async (nextItems: SidebarNavItem[]) => {
      const normalized = reassignSidebarSortOrders(nextItems);
      const previous = items;
      setItems(normalized);
      const { persistSidebarLayoutAction } = await import(
        '@/app/(admin)/admin/actions/sidebarLayout'
      );

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
    },
    [items, setItems, setDragEnabled],
  );

  return persist;
}
