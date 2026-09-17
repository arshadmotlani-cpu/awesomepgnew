'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchStaffForPosAction } from '@/src/hair/actions/quickSale';
import { Input } from '@/src/hair/components/ui/input';
import type { BillableItemType } from '@/src/hair/domain/catalog/types';
import type { StaffAllocation } from '@/src/hair/domain/basket/types';
import { normalizeEqualShares } from '@/src/hair/lib/attributionMath';

export type QuickSaleStaffHit = { id: string; fullName: string };

const DROPDOWN_MAX_H = 220;
const DROPDOWN_GAP = 4;
const VIEWPORT_PAD = 8;

function staffSupportsMultiSplit(lineType: BillableItemType): boolean {
  return lineType === 'service' || lineType === 'product';
}

function clampDropdownPosition(trigger: DOMRect, width: number): { top: number; left: number; width: number } {
  const w = Math.max(160, Math.min(width, window.innerWidth - VIEWPORT_PAD * 2));
  let left = trigger.left;
  if (left + w > window.innerWidth - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, window.innerWidth - VIEWPORT_PAD - w);
  }
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  const below = trigger.bottom + DROPDOWN_GAP;
  const above = trigger.top - DROPDOWN_GAP - DROPDOWN_MAX_H;
  const fitsBelow = below + DROPDOWN_MAX_H <= window.innerHeight - VIEWPORT_PAD;
  const top = fitsBelow || above < VIEWPORT_PAD ? below : Math.max(VIEWPORT_PAD, above);

  return { top, left, width: w };
}

function filterStaffHits(roster: QuickSaleStaffHit[], query: string, limit = 20): QuickSaleStaffHit[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? roster.filter((row) => row.fullName.toLowerCase().includes(q))
    : roster;
  return filtered.slice(0, limit);
}

export function QuickSaleStaffRow({
  lineType,
  staff,
  onChange,
  initialNames,
  preloadedStaff,
  onNameRegistered,
  disabled = false,
  showError = false,
}: {
  lineType: BillableItemType;
  staff: StaffAllocation[];
  onChange: (staff: StaffAllocation[]) => void;
  initialNames?: Record<string, string>;
  preloadedStaff?: QuickSaleStaffHit[];
  onNameRegistered?: (staffId: string, fullName: string) => void;
  disabled?: boolean;
  showError?: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<QuickSaleStaffHit[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [nameById, setNameById] = useState<Record<string, string>>(initialNames ?? {});
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const suppressOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialNames && Object.keys(initialNames).length > 0) {
      setNameById((prev) => ({ ...initialNames, ...prev }));
    }
  }, [initialNames]);

  useEffect(() => {
    if (!open) {
      setHits([]);
      setHighlight(0);
      return;
    }

    if (preloadedStaff && preloadedStaff.length > 0) {
      setHits(filterStaffHits(preloadedStaff, q));
      setHighlight(0);
      const t = window.setTimeout(async () => {
        const rows = await searchStaffForPosAction(q);
        setHits(rows.map((r) => ({ id: r.id, fullName: r.fullName })));
      }, 400);
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(async () => {
      const rows = await searchStaffForPosAction(q);
      setHits(rows.map((r) => ({ id: r.id, fullName: r.fullName })));
      setHighlight(0);
    }, 80);
    return () => window.clearTimeout(t);
  }, [q, open, preloadedStaff]);

  const updatePosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    setPanelPos(clampDropdownPosition(el.getBoundingClientRect(), Math.max(el.offsetWidth, 180)));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, hits.length, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      setHits([]);
      setQ((prev) => {
        if (staff.length === 1) return nameById[staff[0]!.staffId] ?? prev;
        return '';
      });
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, staff, nameById]);

  if (!staffSupportsMultiSplit(lineType)) {
    return <span className="text-xs text-fyh-text-muted">—</span>;
  }

  const closeDropdown = (nextQuery: string) => {
    suppressOpenRef.current = true;
    setOpen(false);
    setHits([]);
    setHighlight(0);
    setQ(nextQuery);
    window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 0);
  };

  const addStaff = (pick: QuickSaleStaffHit) => {
    if (staff.some((s) => s.staffId === pick.id)) {
      closeDropdown(staff.length === 1 ? pick.fullName : '');
      return;
    }
    setNameById((prev) => ({ ...prev, [pick.id]: pick.fullName }));
    onNameRegistered?.(pick.id, pick.fullName);
    const nextIds = [...staff.map((s) => s.staffId), pick.id];
    onChange(
      normalizeEqualShares(nextIds).map((entry) => ({
        staffId: entry.staffId,
        shareBps: entry.shareBps ?? 0,
      })),
    );
    if (nextIds.length === 1) {
      closeDropdown(pick.fullName);
    } else {
      setQ('');
      setHighlight(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const removeStaff = (staffId: string) => {
    const nextIds = staff.filter((s) => s.staffId !== staffId).map((s) => s.staffId);
    onChange(
      normalizeEqualShares(nextIds).map((entry) => ({
        staffId: entry.staffId,
        shareBps: entry.shareBps ?? 0,
      })),
    );
    if (nextIds.length === 1) {
      setQ(nameById[nextIds[0]!] ?? '');
    } else if (nextIds.length === 0) {
      setQ('');
    }
  };

  const singleName = staff.length === 1 ? nameById[staff[0]!.staffId] : undefined;
  const inputValue = open ? q : staff.length === 1 ? (singleName ?? q) : q;
  const placeholder = staff.length === 0 ? 'Search staff…' : 'Search another staff…';

  const dropdown =
    mounted && open && panelPos
      ? createPortal(
          <ul
            ref={panelRef}
            role="listbox"
            data-testid="qs-staff-dropdown"
            className="qs-staff-dropdown"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              maxHeight: DROPDOWN_MAX_H,
            }}
          >
            {hits.length === 0 ? (
              <li className="qs-staff-dropdown-empty">
                {q.trim() ? 'No matching staff' : preloadedStaff?.length ? 'No staff' : 'Loading…'}
              </li>
            ) : (
              hits.map((h, idx) => (
                <li key={h.id} role="option" aria-selected={idx === highlight}>
                  <button
                    type="button"
                    className={`qs-staff-dropdown-option${idx === highlight ? ' qs-staff-dropdown-option-active' : ''}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addStaff(h);
                    }}
                  >
                    {h.fullName}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <>
    <div
      ref={rootRef}
      className={`min-w-[9rem] space-y-1 ${showError ? 'qs-staff-field-error' : ''}`}
      data-testid="qs-staff-row"
    >
      {staff.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {staff.map((s) => (
            <span key={s.staffId} className="qs-staff-chip">
              {nameById[s.staffId] ?? s.staffId.slice(0, 6)}
              <button
                type="button"
                className="ml-0.5 text-fyh-text-muted hover:text-fyh-danger"
                aria-label={`Remove ${nameById[s.staffId] ?? 'staff'}`}
                disabled={disabled}
                onClick={() => removeStaff(s.staffId)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative" data-testid="qs-staff-field">
        <Input
          ref={inputRef}
          disabled={disabled}
          value={inputValue}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          placeholder={placeholder}
          className="h-8 text-xs"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="qs-staff-listbox"
          onFocus={() => {
            if (suppressOpenRef.current) return;
            setOpen(true);
            if (staff.length === 1) setQ('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              // Keep caret movement; do not change highlighted staff.
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              closeDropdown(staff.length === 1 ? (singleName ?? '') : '');
              return;
            }
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              setOpen(true);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (hits.length === 0) return;
              setHighlight((h) => (h + 1) % hits.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (hits.length === 0) return;
              setHighlight((h) => (h - 1 + hits.length) % hits.length);
              return;
            }
            if (e.key === 'Enter') {
              if (open && hits[highlight]) {
                e.preventDefault();
                addStaff(hits[highlight]!);
              }
            }
          }}
        />
      </div>
      {staff.length === 1 ? (
        <button
          type="button"
          className="text-[10px] text-fyh-text-muted hover:text-fyh-danger"
          disabled={disabled}
          onClick={() => removeStaff(staff[0]!.staffId)}
        >
          Clear staff
        </button>
      ) : null}
    </div>
    {dropdown}
    </>
  );
}
