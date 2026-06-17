'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ControlBoardCard } from '@/src/components/admin/ControlBoardCard';
import { ControlBoardDrawer } from '@/src/components/admin/ControlBoardDrawer';
import { loadDrillDownAction } from '@/app/(admin)/admin/overview/actions';
import {
  createStaleGuard,
  fetchPanelData,
  getPanelCache,
  invalidatePanelCache,
} from '@/src/lib/admin/panelFetch';
import type { ControlBoardCard as Card, ControlBoardCategory, ControlBoardDrillDown } from '@/src/lib/controlBoard/types';

const CATEGORY_LABELS: Record<ControlBoardCategory | 'all', string> = {
  all: 'All',
  revenue: 'Revenue',
  collections: 'Collections',
  operations: 'Operations',
  inventory: 'Inventory',
  analytics: 'Analytics',
  pg: 'By PG',
};

type Props = {
  cards: Card[];
  billingMonth: string;
  monthLabel: string;
};

export function ControlBoard({ cards, billingMonth, monthLabel }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const staleGuard = useRef(createStaleGuard());
  const [category, setCategory] = useState<ControlBoardCategory | 'all'>('all');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<ControlBoardDrillDown | null>(null);

  const filtered = useMemo(() => {
    if (category === 'all') return cards;
    return cards.filter((c) => c.category === category);
  }, [cards, category]);

  const highPriorityCount = useMemo(
    () => cards.filter((c) => c.priority === 'high').length,
    [cards],
  );

  const openDrillDown = useCallback(
    async (card: Card) => {
      if (card.href) {
        router.push(card.href);
        return;
      }

      const cacheKey = `drilldown:${card.drillDownKey}:${billingMonth}`;
      const cached = getPanelCache<ControlBoardDrillDown>(cacheKey);
      if (cached) {
        setActiveKey(card.drillDownKey);
        setDrillDown(cached);
        return;
      }

      const version = staleGuard.current.next();
      setActiveKey(card.drillDownKey);
      setDrillDown({
        title: card.label,
        rows: [],
        bulkActionKind: 'none',
        loading: true,
      });

      try {
        const data = await fetchPanelData(cacheKey, () =>
          loadDrillDownAction(card.drillDownKey, billingMonth),
        );
        if (staleGuard.current.isStale(version)) return;
        setDrillDown(data ?? null);
      } catch {
        if (!staleGuard.current.isStale(version)) setDrillDown(null);
      } finally {
        if (!staleGuard.current.isStale(version)) setActiveKey(null);
      }
    },
    [billingMonth, router],
  );

  const refresh = useCallback(() => {
    invalidatePanelCache('drilldown:');
    invalidatePanelCache('action-detail:');
    startTransition(() => router.refresh());
  }, [router]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-apg-silver">
            {cards.length} live metrics · {monthLabel}
            {highPriorityCount > 0 ? (
              <span className="ml-2 text-rose-400">{highPriorityCount} need attention</span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-apg-silver/70">
            Every card is clickable — drill down to residents, then act immediately.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_LABELS) as Array<ControlBoardCategory | 'all'>).map((key) => {
            const count = key === 'all' ? cards.length : cards.filter((c) => c.category === key).length;
            if (key !== 'all' && count === 0) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={
                  'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
                  (category === key
                    ? 'bg-[#FF5A1F] text-white'
                    : 'border border-white/10 text-apg-silver hover:border-white/20 hover:text-white')
                }
              >
                {CATEGORY_LABELS[key]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {filtered.map((c) => (
          <ControlBoardCard
            key={c.id}
            label={c.label}
            value={c.value}
            hint={c.hint}
            accent={c.accent}
            priority={c.priority}
            loading={activeKey === c.drillDownKey}
            onClick={() => void openDrillDown(c)}
          />
        ))}
      </div>

      {drillDown ? (
        <ControlBoardDrawer
          drillDown={drillDown}
          onClose={() => {
            staleGuard.current.next();
            setDrillDown(null);
            setActiveKey(null);
          }}
          onUpdated={() => {
            invalidatePanelCache('drilldown:');
            invalidatePanelCache('action-detail:');
            setDrillDown(null);
            setActiveKey(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
