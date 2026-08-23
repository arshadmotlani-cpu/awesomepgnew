import type { SidebarNavItem } from '@/src/components/admin/sidebar/SidebarLayoutProvider';

/** Stable fingerprint of visible sidebar order (keys + pin flags). */
export function sidebarOrderFingerprint(items: SidebarNavItem[]): string {
  return items
    .filter((item) => !item.hidden)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .map((item) => `${item.key}:${item.pinned ? '1' : '0'}`)
    .join('|');
}

/**
 * Reorder within a single pin section (pinned or unpinned).
 * Returns null when the move is invalid (missing ids, cross-section, no-op).
 */
export function moveSidebarItem(args: {
  items: SidebarNavItem[];
  activeKey: string;
  overKey: string;
}): SidebarNavItem[] | null {
  const { items, activeKey, overKey } = args;
  if (activeKey === overKey) return null;

  const active = items.find((i) => i.key === activeKey);
  const over = items.find((i) => i.key === overKey);
  if (!active || !over || active.hidden || over.hidden) return null;
  if (active.pinned !== over.pinned) return null;

  const section = items
    .filter((i) => !i.hidden && i.pinned === active.pinned)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const oldIndex = section.findIndex((i) => i.key === activeKey);
  const newIndex = section.findIndex((i) => i.key === overKey);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;

  const moved = section.slice();
  const [removed] = moved.splice(oldIndex, 1);
  if (!removed) return null;
  moved.splice(newIndex, 0, removed);

  const otherVisible = items.filter((i) => !i.hidden && i.pinned !== active.pinned);
  const hidden = items.filter((i) => i.hidden);
  const mergedKeys = new Set([
    ...moved.map((i) => i.key),
    ...otherVisible.map((i) => i.key),
    ...hidden.map((i) => i.key),
  ]);
  const untouched = items.filter((i) => !mergedKeys.has(i.key));

  const pinned = active.pinned ? moved : otherVisible;
  const regular = active.pinned ? otherVisible : moved;

  return [...pinned, ...regular, ...hidden, ...untouched].map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}
