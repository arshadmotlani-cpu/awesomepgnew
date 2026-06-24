'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState, useTransition } from 'react';
import {
  resetGlobalSidebarLayoutAction,
  resetPersonalSidebarLayoutAction,
  saveSidebarLayoutAction,
} from '@/app/(admin)/admin/settings/sidebar-layout/actions';
import {
  SIDEBAR_MODULE_REGISTRY,
  sortSidebarLayoutItems,
  type SidebarLayoutEntryInput,
  type SidebarLayoutItem,
} from '@/src/lib/admin/sidebarModules';
import type { SidebarLayoutType } from '@/src/db/schema/enums';

function toEntries(items: SidebarLayoutItem[]): SidebarLayoutEntryInput[] {
  return sortSidebarLayoutItems(items).map((item, index) => ({
    moduleKey: item.key,
    sortOrder: index,
    hidden: item.hidden,
    pinned: item.pinned,
  }));
}

function SortableRow({
  item,
  onToggleHidden,
  onTogglePinned,
}: {
  item: SidebarLayoutItem;
  onToggleHidden: (key: SidebarLayoutItem['key']) => void;
  onTogglePinned: (key: SidebarLayoutItem['key']) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });
  const Icon = SIDEBAR_MODULE_REGISTRY[item.key].icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${
        isDragging
          ? 'border-apg-orange/50 bg-white/10 shadow-lg'
          : 'border-white/10 bg-white/[0.03]'
      } ${item.hidden ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-apg-silver hover:bg-white/10 active:cursor-grabbing"
        aria-label={`Drag ${item.label}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-apg-silver">
        <Icon width={16} height={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {item.pinned ? '⭐ ' : ''}
          {item.label}
        </p>
        <p className="truncate text-[11px] text-apg-silver">{item.href}</p>
      </div>
      <button
        type="button"
        onClick={() => onTogglePinned(item.key)}
        className={`rounded-md px-2 py-1 text-xs font-medium ${
          item.pinned
            ? 'bg-amber-500/20 text-amber-200'
            : 'bg-white/5 text-apg-silver hover:bg-white/10'
        }`}
        aria-pressed={item.pinned}
      >
        Pin
      </button>
      <button
        type="button"
        onClick={() => onToggleHidden(item.key)}
        className={`rounded-md px-2 py-1 text-xs font-medium ${
          item.hidden
            ? 'bg-rose-500/20 text-rose-200'
            : 'bg-white/5 text-apg-silver hover:bg-white/10'
        }`}
        aria-pressed={item.hidden}
      >
        {item.hidden ? 'Hidden' : 'Visible'}
      </button>
    </li>
  );
}

export function SidebarLayoutEditor({
  initialItems,
  isSuperAdmin,
  activeSource,
}: {
  initialItems: SidebarLayoutItem[];
  isSuperAdmin: boolean;
  activeSource: SidebarLayoutType | 'default';
}) {
  const [items, setItems] = useState(() => sortSidebarLayoutItems(initialItems));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedKeys = useMemo(() => items.map((i) => i.key), [items]);

  function updateItem(key: SidebarLayoutItem['key'], patch: Partial<SidebarLayoutItem>) {
    setItems((prev) =>
      sortSidebarLayoutItems(prev.map((item) => (item.key === key ? { ...item, ...patch } : item))),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.key === active.id);
      const newIndex = prev.findIndex((i) => i.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const moved = arrayMove(prev, oldIndex, newIndex).map((item, index) => ({
        ...item,
        sortOrder: index,
      }));
      return sortSidebarLayoutItems(moved);
    });
  }

  function save(scope: SidebarLayoutType) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await saveSidebarLayoutAction(scope, toEntries(items));
      if (result.ok) {
        setMessage(result.message ?? 'Saved.');
      } else {
        setError(result.message ?? 'Save failed.');
      }
    });
  }

  function resetPersonal() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await resetPersonalSidebarLayoutAction();
      if (result.ok) {
        setMessage(result.message ?? 'Reset.');
        window.location.reload();
      } else {
        setError(result.message ?? 'Reset failed.');
      }
    });
  }

  function resetGlobal() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await resetGlobalSidebarLayoutAction();
      if (result.ok) {
        setMessage(result.message ?? 'Reset.');
        window.location.reload();
      } else {
        setError(result.message ?? 'Reset failed.');
      }
    });
  }

  const previewPinned = items.filter((i) => i.pinned && !i.hidden);
  const previewRest = items.filter((i) => !i.pinned && !i.hidden);

  return (
    <div className="space-y-6">
      <p className="text-sm text-apg-silver">
        Drag modules to reorder. Pinned items stay at the top of the sidebar. Hidden modules remain
        accessible via direct URL. Current effective source for you:{' '}
        <span className="font-medium text-white">{activeSource}</span>.
      </p>

      {message ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {items.map((item) => (
              <SortableRow
                key={item.key}
                item={item}
                onToggleHidden={(key) =>
                  updateItem(key, { hidden: !items.find((i) => i.key === key)?.hidden })
                }
                onTogglePinned={(key) =>
                  updateItem(key, { pinned: !items.find((i) => i.key === key)?.pinned })
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-apg-silver">Preview</p>
        <ul className="mt-3 space-y-1 text-sm text-white">
          {previewPinned.map((i) => (
            <li key={i.key}>⭐ {i.label}</li>
          ))}
          {previewRest.map((i) => (
            <li key={i.key}>{i.label}</li>
          ))}
          {items.every((i) => i.hidden) ? (
            <li className="text-apg-silver">All modules hidden</li>
          ) : null}
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => save('personal')}
          className="rounded-lg bg-apg-orange px-4 py-2 text-sm font-semibold text-white hover:bg-apg-orange/90 disabled:opacity-50"
        >
          Save personal layout
        </button>
        {isSuperAdmin ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => save('global')}
            className="rounded-lg border border-apg-orange/40 bg-apg-orange/10 px-4 py-2 text-sm font-semibold text-apg-orange hover:bg-apg-orange/20 disabled:opacity-50"
          >
            Save global layout
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={resetPersonal}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-apg-silver hover:bg-white/5 disabled:opacity-50"
        >
          Reset my layout
        </button>
        {isSuperAdmin ? (
          <button
            type="button"
            disabled={pending}
            onClick={resetGlobal}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-apg-silver hover:bg-white/5 disabled:opacity-50"
          >
            Reset global layout
          </button>
        ) : null}
      </div>
    </div>
  );
}
