'use client';

import { useEffect, useState } from 'react';
import { searchStaffForPosAction } from '@/src/hair/actions/quickSale';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

export type StaffPick = { id: string; fullName: string };

export function StaffTypeahead({
  label,
  value,
  onPick,
  placeholder = 'Type to search…',
}: {
  label: string;
  value: StaffPick | null;
  onPick: (s: StaffPick | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState(value?.fullName ?? '');
  const [hits, setHits] = useState<StaffPick[]>([]);

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

  return (
    <div className="relative space-y-1">
      <span className="text-xs text-fyh-text-muted">{label}</span>
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (!e.target.value.trim()) onPick(null);
        }}
        placeholder={placeholder}
        className="h-9"
      />
      {value ? (
        <p className="text-xs text-fyh-accent">✓ {value.fullName}</p>
      ) : null}
      {hits.length > 0 && !value ? (
        <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] py-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                onClick={() => {
                  onPick(h);
                  setQ(h.fullName);
                  setHits([]);
                }}
              >
                {h.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ServicedByMulti({
  staff,
  onChange,
}: {
  staff: StaffPick[];
  onChange: (next: StaffPick[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-fyh-text-muted">Serviced by</span>
      <ul className="space-y-1">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-sm">
            <span>✓ {s.fullName}</span>
            <button
              type="button"
              className="text-xs text-fyh-danger"
              onClick={() => onChange(staff.filter((x) => x.id !== s.id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <StaffTypeahead
          label="Add stylist"
          value={null}
          onPick={(s) => {
            if (s && !staff.some((x) => x.id === s.id)) onChange([...staff, s]);
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
