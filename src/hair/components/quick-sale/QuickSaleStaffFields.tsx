'use client';

import { useEffect, useRef, useState } from 'react';
import { searchStaffForPosAction } from '@/src/hair/actions/quickSale';
import { Input } from '@/src/hair/components/ui/input';
import type { BillableItemType } from '@/src/hair/domain/catalog/types';
import type { StaffAllocation } from '@/src/hair/domain/basket/types';
import { normalizeEqualShares } from '@/src/hair/lib/attributionMath';

type StaffHit = { id: string; fullName: string };

function staffSupportsMultiSplit(lineType: BillableItemType): boolean {
  return lineType === 'service' || lineType === 'product';
}

export function QuickSaleStaffRow({
  lineType,
  staff,
  onChange,
  initialNames,
  onNameRegistered,
}: {
  lineType: BillableItemType;
  staff: StaffAllocation[];
  onChange: (staff: StaffAllocation[]) => void;
  initialNames?: Record<string, string>;
  onNameRegistered?: (staffId: string, fullName: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StaffHit[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>(initialNames ?? {});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialNames && Object.keys(initialNames).length > 0) {
      setNameById((prev) => ({ ...initialNames, ...prev }));
    }
  }, [initialNames]);

  useEffect(() => {
    if (q.trim().length < 1) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      const rows = await searchStaffForPosAction(q);
      setHits(rows.map((r) => ({ id: r.id, fullName: r.fullName })));
    }, 120);
    return () => window.clearTimeout(t);
  }, [q]);

  if (!staffSupportsMultiSplit(lineType)) {
    return <span className="text-xs text-fyh-text-muted">—</span>;
  }

  const addStaff = (pick: StaffHit) => {
    if (staff.some((s) => s.staffId === pick.id)) {
      setQ('');
      setHits([]);
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
    setQ('');
    setHits([]);
    inputRef.current?.focus();
  };

  const removeStaff = (staffId: string) => {
    const nextIds = staff.filter((s) => s.staffId !== staffId).map((s) => s.staffId);
    onChange(
      normalizeEqualShares(nextIds).map((entry) => ({
        staffId: entry.staffId,
        shareBps: entry.shareBps ?? 0,
      })),
    );
  };

  const placeholder =
    staff.length === 0 ? 'Search staff…' : 'Search another staff…';

  return (
    <div className="min-w-[10rem] space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fyh-text-muted">Staff</p>
      {staff.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {staff.map((s) => (
            <span key={s.staffId} className="qs-staff-chip">
              {nameById[s.staffId] ?? s.staffId.slice(0, 6)}
              <button
                type="button"
                className="ml-0.5 text-fyh-text-muted hover:text-fyh-danger"
                aria-label={`Remove ${nameById[s.staffId] ?? 'staff'}`}
                onClick={() => removeStaff(s.staffId)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="h-9 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) {
              e.preventDefault();
              addStaff(hits[0]);
            }
            if (e.key === 'Escape') {
              setQ('');
              setHits([]);
            }
          }}
        />
        {hits.length > 0 && q.trim() ? (
          <ul className="absolute z-30 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] py-1 shadow-xl">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                  onClick={() => addStaff(h)}
                >
                  {h.fullName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
