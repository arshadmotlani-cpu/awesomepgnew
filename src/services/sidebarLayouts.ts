import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { sidebarLayouts } from '@/src/db/schema';
import type { SidebarLayoutType } from '@/src/db/schema/enums';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  buildDefaultLayoutEntries,
  isSidebarModuleKey,
  SIDEBAR_MODULE_REGISTRY,
  sortSidebarLayoutItems,
  toRenderableSidebarItems,
  type SidebarLayoutEntryInput,
  type SidebarLayoutItem,
  type SidebarModuleKey,
} from '@/src/lib/admin/sidebarModules';

export type ResolvedSidebarLayout = {
  items: SidebarLayoutItem[];
  visibleItems: SidebarLayoutItem[];
  source: 'personal' | 'global' | 'default';
};

function rowsToItems(
  rows: Array<{
    moduleKey: string;
    sortOrder: number;
    hidden: boolean;
    pinned: boolean;
  }>,
): SidebarLayoutItem[] {
  const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
  const items: SidebarLayoutItem[] = [];

  for (const def of Object.values(SIDEBAR_MODULE_REGISTRY)) {
    const row = byKey.get(def.key);
    items.push({
      ...def,
      sortOrder: row?.sortOrder ?? items.length,
      hidden: row?.hidden ?? false,
      pinned: row?.pinned ?? false,
    });
  }

  return sortSidebarLayoutItems(items);
}

async function loadLayoutRows(
  layoutType: SidebarLayoutType,
  userId: string | null,
): Promise<Array<typeof sidebarLayouts.$inferSelect>> {
  if (layoutType === 'global') {
    return db
      .select()
      .from(sidebarLayouts)
      .where(and(eq(sidebarLayouts.layoutType, 'global'), isNull(sidebarLayouts.userId)));
  }
  if (!userId) return [];
  return db
    .select()
    .from(sidebarLayouts)
    .where(
      and(eq(sidebarLayouts.layoutType, 'personal'), eq(sidebarLayouts.userId, userId)),
    );
}

function mergeRowsWithDefaults(
  rows: Array<typeof sidebarLayouts.$inferSelect>,
): SidebarLayoutItem[] {
  if (rows.length === 0) {
    return rowsToItems(buildDefaultLayoutEntries());
  }
  return rowsToItems(
    rows.map((r) => ({
      moduleKey: r.moduleKey,
      sortOrder: r.sortOrder,
      hidden: r.hidden,
      pinned: r.pinned,
    })),
  );
}

export async function getResolvedSidebarLayout(
  session: AdminSession,
): Promise<ResolvedSidebarLayout> {
  const personalRows = await loadLayoutRows('personal', session.adminId);
  if (personalRows.length > 0) {
    const items = mergeRowsWithDefaults(personalRows);
    return { items, visibleItems: toRenderableSidebarItems(items), source: 'personal' };
  }

  const globalRows = await loadLayoutRows('global', null);
  if (globalRows.length > 0) {
    const items = mergeRowsWithDefaults(globalRows);
    return { items, visibleItems: toRenderableSidebarItems(items), source: 'global' };
  }

  const items = mergeRowsWithDefaults([]);
  return { items, visibleItems: toRenderableSidebarItems(items), source: 'default' };
}

export async function getEditableSidebarLayout(
  session: AdminSession,
  scope: SidebarLayoutType,
): Promise<{ items: SidebarLayoutItem[]; source: SidebarLayoutType | 'default' }> {
  if (scope === 'personal') {
    const personalRows = await loadLayoutRows('personal', session.adminId);
    if (personalRows.length > 0) {
      return { items: mergeRowsWithDefaults(personalRows), source: 'personal' };
    }
    const globalRows = await loadLayoutRows('global', null);
    if (globalRows.length > 0) {
      return { items: mergeRowsWithDefaults(globalRows), source: 'global' };
    }
    return { items: mergeRowsWithDefaults([]), source: 'default' };
  }

  const globalRows = await loadLayoutRows('global', null);
  if (globalRows.length > 0) {
    return { items: mergeRowsWithDefaults(globalRows), source: 'global' };
  }
  return { items: mergeRowsWithDefaults([]), source: 'default' };
}

function validateEntries(entries: SidebarLayoutEntryInput[]): SidebarLayoutEntryInput[] {
  const seen = new Set<string>();
  const valid: SidebarLayoutEntryInput[] = [];
  for (const entry of entries) {
    if (!isSidebarModuleKey(entry.moduleKey)) continue;
    if (seen.has(entry.moduleKey)) continue;
    seen.add(entry.moduleKey);
    valid.push({
      moduleKey: entry.moduleKey,
      sortOrder: entry.sortOrder,
      hidden: Boolean(entry.hidden),
      pinned: Boolean(entry.pinned),
    });
  }

  for (const key of Object.keys(SIDEBAR_MODULE_REGISTRY) as SidebarModuleKey[]) {
    if (!seen.has(key)) {
      valid.push({
        moduleKey: key,
        sortOrder: valid.length,
        hidden: false,
        pinned: false,
      });
    }
  }

  return valid.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function saveSidebarLayout(
  session: AdminSession,
  scope: SidebarLayoutType,
  entries: SidebarLayoutEntryInput[],
): Promise<void> {
  if (scope === 'global' && session.role !== 'super_admin') {
    throw new Error('Only Super Admin can save the global sidebar layout.');
  }

  const normalized = validateEntries(entries);
  const now = new Date();
  const userId = scope === 'personal' ? session.adminId : null;

  await db.transaction(async (tx) => {
    if (scope === 'global') {
      await tx
        .delete(sidebarLayouts)
        .where(and(eq(sidebarLayouts.layoutType, 'global'), isNull(sidebarLayouts.userId)));
    } else {
      await tx
        .delete(sidebarLayouts)
        .where(
          and(
            eq(sidebarLayouts.layoutType, 'personal'),
            eq(sidebarLayouts.userId, session.adminId),
          ),
        );
    }

    if (normalized.length === 0) return;

    await tx.insert(sidebarLayouts).values(
      normalized.map((entry, index) => ({
        userId,
        layoutType: scope,
        moduleKey: entry.moduleKey,
        sortOrder: entry.sortOrder ?? index,
        hidden: entry.hidden,
        pinned: entry.pinned,
        updatedAt: now,
      })),
    );
  });
}

export async function resetPersonalSidebarLayout(session: AdminSession): Promise<void> {
  await db
    .delete(sidebarLayouts)
    .where(
      and(
        eq(sidebarLayouts.layoutType, 'personal'),
        eq(sidebarLayouts.userId, session.adminId),
      ),
    );
}

export async function resetGlobalSidebarLayout(session: AdminSession): Promise<void> {
  if (session.role !== 'super_admin') {
    throw new Error('Only Super Admin can reset the global sidebar layout.');
  }
  await db
    .delete(sidebarLayouts)
    .where(and(eq(sidebarLayouts.layoutType, 'global'), isNull(sidebarLayouts.userId)));
}

export async function countSidebarLayoutRows(
  layoutType: SidebarLayoutType,
  userId: string | null,
): Promise<number> {
  const rows = await loadLayoutRows(layoutType, userId);
  return rows.length;
}

export async function getSidebarLayoutOrder(
  session: AdminSession,
  scope: SidebarLayoutType,
): Promise<SidebarModuleKey[]> {
  const { items } = await getEditableSidebarLayout(session, scope);
  return sortSidebarLayoutItems(items).map((i) => i.key);
}
