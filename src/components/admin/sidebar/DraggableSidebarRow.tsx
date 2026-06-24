'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AdminNavLink } from '@/src/components/admin/AdminNavLink';
import { SIDEBAR_MODULE_REGISTRY } from '@/src/lib/admin/sidebarModules';
import { isModuleActive } from '@/src/lib/admin/navigation';
import { useAdminNavBadges } from '@/src/components/admin/AdminLiveRefreshProvider';
import type { SidebarNavItem } from '@/src/components/admin/sidebar/SidebarLayoutProvider';

export function DraggableSidebarRow({
  item,
  activePath,
  onNavigateStart,
  onPinToggle,
  overlay = false,
}: {
  item: SidebarNavItem;
  activePath: string;
  onNavigateStart: (href: string) => void;
  onPinToggle: (key: SidebarNavItem['key'], pinned: boolean) => void;
  overlay?: boolean;
}) {
  const badges = useAdminNavBadges();
  const def = SIDEBAR_MODULE_REGISTRY[item.key];
  const Icon = def.icon;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
    disabled: overlay,
  });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLLIElement | null>(null);

  const active = item.module
    ? isModuleActive(activePath, item.module)
    : activePath === item.href || activePath.startsWith(`${item.href}/`);
  const badgeCount = item.badgeKey
    ? badges[item.badgeKey]
    : item.module
      ? badges[item.module]
      : undefined;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const openMenuAt = useCallback((x: number, y: number) => {
    setMenu({ x, y });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onDoc = () => closeMenu();
    document.addEventListener('click', onDoc);
    document.addEventListener('contextmenu', onDoc);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('contextmenu', onDoc);
    };
  }, [menu, closeMenu]);

  const setRefs = useCallback(
    (node: HTMLLIElement | null) => {
      setNodeRef(node);
      rowRef.current = node;
    },
    [setNodeRef],
  );

  return (
    <li
      ref={setRefs}
      style={overlay ? undefined : style}
      className={`group relative ${isDragging && !overlay ? 'z-40 opacity-90' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY);
      }}
    >
      <div
        className={`flex items-center gap-0.5 rounded-md transition-shadow ${
          isDragging && !overlay ? 'scale-[1.02] shadow-lg ring-1 ring-apg-orange/30' : ''
        }`}
      >
        <button
          type="button"
          className="flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-[11px] leading-none text-apg-silver/50 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/5 hover:text-apg-silver active:cursor-grabbing"
          aria-label={`Drag ${item.label}`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>

        <div className="min-w-0 flex-1">
          <AdminNavLink
            href={item.href}
            label={item.label}
            icon={Icon}
            active={active}
            badgeCount={badgeCount}
            onNavigateStart={onNavigateStart}
          />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const rect = rowRef.current?.getBoundingClientRect();
            openMenuAt(rect?.right ?? e.clientX, rect?.top ?? e.clientY);
          }}
          className="mr-1 flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-apg-silver/60 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/5 hover:text-white"
          aria-label={`${item.label} options`}
        >
          ⋯
        </button>
      </div>

      {menu && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[300] min-w-[10rem] rounded-lg border border-white/10 bg-[#1f252e] py-1 shadow-2xl"
              style={{ left: menu.x, top: menu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                onClick={() => {
                  onPinToggle(item.key, !item.pinned);
                  closeMenu();
                }}
              >
                {item.pinned ? 'Unpin' : 'Pin to top'}
              </button>
            </div>,
            document.body,
          )
        : null}
    </li>
  );
}
