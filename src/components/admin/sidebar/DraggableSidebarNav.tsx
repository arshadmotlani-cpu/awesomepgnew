'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DraggableSidebarRow,
  SidebarRowDragPreview,
} from '@/src/components/admin/sidebar/DraggableSidebarRow';
import {
  reassignSidebarSortOrders,
  usePersistSidebarLayout,
  useSidebarLayout,
  type SidebarNavItem,
} from '@/src/components/admin/sidebar/SidebarLayoutProvider';
import { moveSidebarItem } from '@/src/components/admin/sidebar/sidebarOrder';

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
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(
    () =>
      items
        .filter((i) => !i.hidden)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );
  const pinned = useMemo(() => visible.filter((i) => i.pinned), [visible]);
  const regular = useMemo(() => visible.filter((i) => !i.pinned), [visible]);
  const sortableIds = useMemo(() => visible.map((i) => i.key), [visible]);

  const activeItem = activeId ? items.find((i) => i.key === activeId) : null;

  const schedulePersist = useCallback(
    (next: SidebarNavItem[], previous: SidebarNavItem[]) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void persist(next, previous);
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
      if (!dragEnabled) {
        setActiveId(null);
        return;
      }
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const previous = itemsRef.current;
      const next = moveSidebarItem({
        items: previous,
        activeKey: String(active.id),
        overKey: String(over.id),
      });
      if (!next) return;

      setItems(next);
      schedulePersist(next, previous);
    },
    [dragEnabled, setItems, schedulePersist],
  );

  const onDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const onPinToggle = useCallback(
    (key: SidebarNavItem['key'], pinned: boolean) => {
      const previous = itemsRef.current;
      const next = reassignSidebarSortOrders(
        previous.map((item) => (item.key === key ? { ...item, pinned } : item)),
      );
      setItems(next);
      schedulePersist(next, previous);
    },
    [setItems, schedulePersist],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {/* One SortableContext for all visible rows — dual contexts made drops unreliable. */}
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {pinned.length > 0 ? (
          <div className="mt-2">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/70">
              Pinned
            </p>
            <ul className="space-y-0.5">
              {pinned.map((item) => (
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
          </div>
        ) : null}

        <div className="mt-2">
          {pinned.length > 0 && regular.length > 0 ? (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/70">
              Navigation
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {regular.map((item) => (
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
        </div>
      </SortableContext>

      {typeof document !== 'undefined'
        ? createPortal(
            <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.2,0,0,1)' }}>
              {activeItem ? (
                <SidebarRowDragPreview item={activeItem} activePath={activePath} />
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
