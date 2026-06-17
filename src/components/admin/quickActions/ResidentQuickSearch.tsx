'use client';

import { useEffect, useState } from 'react';

export type ResidentQuickResult = {
  id: string;
  fullName: string;
  phone: string;
  bookingId: string | null;
  bookingCode?: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
};

export function ResidentQuickSearch({
  onSelect,
  requireBooking = true,
  selected,
}: {
  onSelect: (row: ResidentQuickResult | null) => void;
  requireBooking?: boolean;
  selected: ResidentQuickResult | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResidentQuickResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/admin/residents/search?q=${encodeURIComponent(query.trim())}&withBooking=1`,
            { cache: 'no-store' },
          );
          const json = (await res.json()) as { ok: boolean; data?: ResidentQuickResult[] };
          setResults(json.ok ? (json.data ?? []) : []);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (selected) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-white">{selected.fullName}</p>
            <p className="text-xs text-apg-silver">
              {selected.phone}
              {selected.pgName ? ` · ${selected.pgName}` : ''}
              {selected.roomNumber ? ` · Room ${selected.roomNumber}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-apg-silver hover:text-white"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tenant by name or phone…"
        className="w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        autoFocus
      />
      {loading ? <p className="text-xs text-apg-silver">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
          {results.map((r) => {
            const disabled = requireBooking && !r.bookingId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(r)}
                  className="w-full px-3 py-2 text-left hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <p className="text-sm font-medium text-white">{r.fullName}</p>
                  <p className="text-[11px] text-apg-silver">
                    {r.phone}
                    {r.pgName ? ` · ${r.pgName}` : ' · No booking'}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim().length >= 2 && !loading ? (
        <p className="text-xs text-apg-silver">No matching tenants.</p>
      ) : null}
    </div>
  );
}
