'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DraggableSidebarRow } from '@/src/components/admin/sidebar/DraggableSidebarRow';
import {
  reassignSidebarSortOrders,
  usePersistSidebarLayout,
  useSidebarLayout,
  type SidebarNavItem,
} from '@/src/components/admin/sidebar/SidebarLayoutProvider';

type SectionProps = {
  title?: string;
  items: SidebarNavItem[];
  activePath: string;
  onNavigateStart: (href: string) => void;
  onPinToggle: (key: SidebarNavItem['key'], pinned: boolean) => void;
  dragEnabled: boolean;
};

function SidebarSection({
  title,
  items,
  activePath,
  onNavigateStart,
  onPinToggle,
  dragEnabled,
}: SectionProps) {
  const ids = useMemo(() => items.map((i) => i.key), [items]);
  if (items.length === 0) return null;

  return (
    <div className="mt-2">
      {title ? (
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/70">
          {title}
        </p>
      ) : null}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-0.5">
          {items.map((item) => (
            <DraggableSidebarRow
              key={item.key}
              item={item}
              activePath={activePath}
              onNavigateStart={onNavigateStart}
              onPinToggle={onPinToggle}
              dragEnabled={dragEnabled}
            />
          ))}
        </ul>
      </SortableContext>
    </div>
  );
}

export function DraggableSidebarNav({
  activePath,
  onNavigateStart,
}: {
  activePath: string;
  onNavigateStart: (href: string) => void;
}) {
  const { items, setItems, dragEnabled } = useSidebarLayout();
  const persist = usePersistSidebarLayout();
  const [activeId, setActiveId] = useState<SidebarNavItem['key'] | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(() => items.filter((i) => !i.hidden), [items]);
  const pinned = useMemo(
    () => visible.filter((i) => i.pinned).sort((a, b) => a.sortOrder - b.sortOrder),
    [visible],
  );
  const regular = useMemo(
    () => visible.filter((i) => !i.pinned).sort((a, b) => a.sortOrder - b.sortOrder),
    [visible],
  );

  const activeItem = activeId ? items.find((i) => i.key === activeId) : null;

  const schedulePersist = useCallback(
    (next: SidebarNavItem[]) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void persist(next);
      }, 0);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    [],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id) as SidebarNavItem['key']);
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!dragEnabled) return;
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeItemRow = items.find((i) => i.key === active.id);
      const overItemRow = items.find((i) => i.key === over.id);
      if (!activeItemRow || !overItemRow || activeItemRow.hidden || overItemRow.hidden) return;
      if (activeItemRow.pinned !== overItemRow.pinned) return;

      const section = visible
        .filter((i) => i.pinned === activeItemRow.pinned)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIndex = section.findIndex((i) => i.key === active.id);
      const newIndex = section.findIndex((i) => i.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const movedSection = arrayMove(section, oldIndex, newIndex);
      const otherVisible = visible.filter((i) => i.pinned !== activeItemRow.pinned);
      const hidden = items.filter((i) => i.hidden);
      const mergedKeys = new Set([
        ...movedSection.map((i) => i.key),
        ...otherVisible.map((i) => i.key),
        ...hidden.map((i) => i.key),
      ]);
      const untouched = items.filter((i) => !mergedKeys.has(i.key));
      const next = reassignSidebarSortOrders([
        ...movedSection,
        ...otherVisible,
        ...hidden,
        ...untouched,
      ]);
      setItems(next);
      schedulePersist(next);
    },
    [items, visible, setItems, schedulePersist, dragEnabled],
  );

  const onPinToggle = useCallback(
    (key: SidebarNavItem['key'], pinned: boolean) => {
      const next = reassignSidebarSortOrders(
        items.map((item) => (item.key === key ? { ...item, pinned } : item)),
      );
      setItems(next);
      schedulePersist(next);
    },
    [items, setItems, schedulePersist],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SidebarSection
        title={pinned.length > 0 ? 'Pinned' : undefined}
        items={pinned}
        activePath={activePath}
        onNavigateStart={onNavigateStart}
        onPinToggle={onPinToggle}
        dragEnabled={dragEnabled}
      />
      <SidebarSection
        title={pinned.length > 0 && regular.length > 0 ? 'Navigation' : undefined}
        items={regular}
        activePath={activePath}
        onNavigateStart={onNavigateStart}
        onPinToggle={onPinToggle}
        dragEnabled={dragEnabled}
      />

      {typeof document !== 'undefined'
        ? createPortal(
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0,0,1)' }}>
              {activeItem ? (
                <div className="scale-[1.02] rounded-md border border-apg-orange/40 bg-[#252b35] px-2 py-1 opacity-90 shadow-xl">
                  <DraggableSidebarRow
                    item={activeItem}
                    activePath={activePath}
                    onNavigateStart={() => undefined}
                    onPinToggle={() => undefined}
                    overlay
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
