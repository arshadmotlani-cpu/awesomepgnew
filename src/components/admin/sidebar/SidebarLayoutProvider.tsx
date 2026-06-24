'use client';

import { createContext, useContext, type ReactNode } from 'react';
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

const SidebarLayoutContext = createContext<SidebarNavItem[]>([]);

export function SidebarLayoutProvider({
  items,
  children,
}: {
  items: SidebarNavItem[];
  children: ReactNode;
}) {
  return (
    <SidebarLayoutContext.Provider value={items}>{children}</SidebarLayoutContext.Provider>
  );
}

export function useSidebarLayoutItems(): SidebarNavItem[] {
  return useContext(SidebarLayoutContext);
}
