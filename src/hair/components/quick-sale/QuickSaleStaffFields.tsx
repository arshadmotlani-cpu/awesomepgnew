'use client';

import { useState } from 'react';
import { StaffTypeahead, type StaffPick } from '@/src/hair/components/quick-sale/QuickSaleStaffPickers';
import { Button } from '@/src/hair/components/ui/button';
import type { StaffAllocation } from '@/src/hair/domain/basket/types';
import type { StaffMode } from '@/src/hair/domain/catalog/types';
import { normalizeEqualShares } from '@/src/hair/lib/attributionMath';

export function QuickSaleStaffRow({
  staffMode,
  staff,
  onChange,
}: {
  staffMode: StaffMode;
  staff: StaffAllocation[];
  onChange: (staff: StaffAllocation[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  if (staffMode === 'SALE') {
    const pick: StaffPick | null = staff[0]
      ? { id: staff[0].staffId, fullName: '' }
      : null;
    return (
      <StaffTypeahead
        label="Sold by"
        value={pick}
        onPick={(s) => onChange(s ? [{ staffId: s.id, shareBps: 10_000 }] : [])}
      />
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-xs text-fyh-text-muted">Service by</span>
      {staff.map((s) => (
        <div key={s.staffId} className="flex items-center gap-1 text-xs">
          <span className="flex-1 truncate text-fyh-text-secondary tabular-nums">
            {(s.shareBps / 100).toFixed(0)}%
          </span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={s.shareBps / 100}
            onChange={(e) => {
              const shareBps = Math.round(Number(e.target.value || 0) * 100);
              onChange(
                staff.map((x) => (x.staffId === s.staffId ? { ...x, shareBps } : x)),
              );
            }}
            className="h-7 w-12 rounded border border-[color:var(--fyh-border)] bg-black/20 px-1 text-right tabular-nums"
          />
          <button
            type="button"
            className="text-fyh-danger"
            onClick={() => onChange(staff.filter((x) => x.staffId !== s.staffId))}
          >
            ×
          </button>
        </div>
      ))}
      {adding ? (
        <StaffTypeahead
          label="Add"
          value={null}
          onPick={(s) => {
            if (!s || staff.some((x) => x.staffId === s.id)) {
              setAdding(false);
              return;
            }
            const nextIds = [...staff.map((x) => x.staffId), s.id];
            onChange(normalizeEqualShares(nextIds));
            setAdding(false);
          }}
        />
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
          +
        </Button>
      )}
    </div>
  );
}
