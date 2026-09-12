'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { BillableItem } from '@/src/hair/domain/catalog/types';

type Props = {
  catalogQ: string;
  results: BillableItem[];
  workspaceLocked: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onCatalogQChange: (value: string) => void;
  onSelectItem: (item: BillableItem) => void;
  onClose: () => void;
};

const TYPE_LABEL: Record<string, string> = {
  service: 'Service',
  product: 'Product',
  package: 'Package',
  membership: 'Membership',
};

export function QuickSaleItemSearch({
  catalogQ,
  results,
  workspaceLocked,
  searchRef,
  onCatalogQChange,
  onSelectItem,
  onClose,
}: Props) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const open = catalogQ.trim().length > 0 && results.length > 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [catalogQ, results.length]);

  const selectHighlighted = () => {
    const item = results[highlightIndex];
    if (item) onSelectItem(item);
  };

  return (
    <div className="qs-compact-search" data-testid="qs-item-search">
      <Input
        ref={searchRef}
        aria-label="Search service, product, package or membership"
        aria-expanded={open}
        aria-controls="qs-search-results"
        aria-activedescendant={open ? `qs-search-result-${highlightIndex}` : undefined}
        role="combobox"
        autoComplete="off"
        disabled={workspaceLocked}
        value={catalogQ}
        onChange={(e) => onCatalogQChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
          }
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            selectHighlighted();
          }
        }}
        placeholder="Search service, product, package or membership…"
        className="qs-compact-search-input"
      />
      {open ? (
        <ul id="qs-search-results" className="qs-compact-search-results" role="listbox">
          {results.map((item, index) => (
            <li key={`${item.type}-${item.id}`} role="option" aria-selected={index === highlightIndex}>
              <button
                id={`qs-search-result-${index}`}
                type="button"
                className={`qs-compact-search-result${index === highlightIndex ? ' qs-compact-search-result-active' : ''}`}
                disabled={workspaceLocked}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => onSelectItem(item)}
              >
                <span className="qs-compact-search-result-name">
                  {item.name}
                  <span className="qs-compact-search-result-type">
                    {TYPE_LABEL[item.type] ?? item.type}
                  </span>
                </span>
                <span className="qs-compact-search-result-price tabular-nums">
                  {formatInrFromPaise(item.sellingPricePaise)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
