'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { BillableItem } from '@/src/hair/domain/catalog/types';
import type { QuickSaleTab } from '@/src/hair/lib/quickSaleSession';

type TabFilter = QuickSaleTab;

type Props = {
  tab: TabFilter;
  catalogQ: string;
  filteredItems: BillableItem[];
  workspaceLocked: boolean;
  catalogSearchRef: RefObject<HTMLInputElement | null>;
  onTabChange: (tab: TabFilter) => void;
  onCatalogQChange: (value: string) => void;
  onAddItem: (item: BillableItem) => void;
};

const TABS: Array<{ id: TabFilter; label: string }> = [
  { id: 'service', label: 'Services' },
  { id: 'product', label: 'Products' },
  { id: 'package', label: 'Packages' },
  { id: 'membership', label: 'Memberships' },
];

export function QuickSaleCatalogPanel({
  tab,
  catalogQ,
  filteredItems,
  workspaceLocked,
  catalogSearchRef,
  onTabChange,
  onCatalogQChange,
  onAddItem,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    setCategoryFilter('all');
  }, [tab]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of filteredItems) {
      if (item.category?.trim()) set.add(item.category.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [filteredItems]);

  const categoryFilteredItems = useMemo(() => {
    if (categoryFilter === 'all') return filteredItems;
    return filteredItems.filter((item) => item.category === categoryFilter);
  }, [filteredItems, categoryFilter]);

  const visibleItems = categoryFilteredItems.slice(0, 80);

  return (
    <section className="qs-catalog-panel" data-testid="qs-catalog-panel">
      <div className="qs-catalog-toolbar">
        <div className="qs-catalog-tabs">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              disabled={workspaceLocked}
              className={`qs-catalog-tab ${tab === id ? 'qs-catalog-tab-active' : ''}`}
              onClick={() => {
                onTabChange(id);
                catalogSearchRef.current?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="qs-catalog-search-row">
          <Input
            ref={catalogSearchRef}
            aria-label="Search catalog items"
            disabled={workspaceLocked}
            value={catalogQ}
            onChange={(e) => onCatalogQChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visibleItems[0]) {
                e.preventDefault();
                onAddItem(visibleItems[0]);
              }
              if (e.key === 'ArrowDown' && visibleItems.length > 0) {
                e.preventDefault();
                const first = document.querySelector<HTMLButtonElement>('[data-qs-catalog-item]');
                first?.focus();
              }
            }}
            placeholder="Search name, code, or price…"
            className="qs-catalog-search"
          />
          <select
            aria-label="Filter by category"
            className="qs-catalog-category-filter"
            disabled={workspaceLocked || categories.length === 0}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            data-testid="qs-catalog-category-filter"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <p className="qs-catalog-kbd-hint">
          Press <strong>/</strong> to search · <strong>Enter</strong> to add first result
        </p>
      </div>

      <div className="qs-catalog-scroll">
        <table className="qs-catalog-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Category</th>
              <th>Code</th>
              <th className="text-right">Price</th>
              <th className="w-16 text-right">Add</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="qs-catalog-empty">
                  {catalogQ.trim() || categoryFilter !== 'all'
                    ? 'No matching items'
                    : 'Search or browse the catalogue'}
                </td>
              </tr>
            ) : (
              visibleItems.map((item, index) => (
                <tr key={`${item.type}-${item.id}`}>
                  <td className="tabular-nums text-slate-400">{index + 1}</td>
                  <td>
                    <span className="font-medium">{item.name}</span>
                  </td>
                  <td className="text-slate-400">{item.category ?? '—'}</td>
                  <td className="text-slate-500">{item.code ?? '—'}</td>
                  <td className="text-right tabular-nums font-medium">
                    {formatInrFromPaise(item.sellingPricePaise)}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="qs-catalog-add-btn"
                      data-qs-catalog-item
                      disabled={workspaceLocked}
                      onClick={() => onAddItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onAddItem(item);
                        }
                      }}
                    >
                      + Add
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
