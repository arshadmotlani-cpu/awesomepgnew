'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type ResidentQuickResult = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  kycStatus?: string;
  tenancyStatus: 'unassigned' | 'active' | 'vacating' | 'vacated' | 'blocked';
  bookingId: string | null;
  bookingCode?: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  roomId: string | null;
  bedId?: string | null;
  monthlyRentPaise: number;
};

function TenancyBadge({ status }: { status: ResidentQuickResult['tenancyStatus'] }) {
  if (status === 'active' || status === 'vacating') {
    return (
      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
        {status === 'vacating' ? 'Vacating' : 'Occupied'}
      </span>
    );
  }
  if (status === 'unassigned') {
    return (
      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
        Unassigned
      </span>
    );
  }
  return (
    <span className="rounded bg-zinc-500/20 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
      {status}
    </span>
  );
}

export function ResidentQuickSearch({
  onSelect,
  selected,
}: {
  onSelect: (row: ResidentQuickResult | null) => void;
  selected: ResidentQuickResult | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResidentQuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(
            `/api/admin/residents/search?q=${encodeURIComponent(query.trim())}`,
            { cache: 'no-store' },
          );
          const json = (await res.json()) as {
            ok: boolean;
            data?: ResidentQuickResult[];
            error?: string;
          };
          if (!res.ok || !json.ok) {
            setError(json.error ?? 'Search failed.');
            setResults([]);
            return;
          }
          setResults(json.data ?? []);
        } catch {
          setError('Search failed.');
          setResults([]);
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
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-white">{selected.fullName}</p>
              <TenancyBadge status={selected.tenancyStatus} />
            </div>
            <p className="mt-1 text-xs text-apg-silver">
              {selected.phone}
              {selected.pgName && selected.roomNumber
                ? ` · ${selected.pgName} · Room ${selected.roomNumber} · ${selected.bedCode ?? 'bed'}`
                : null}
            </p>
            {selected.bookingCode ? (
              <p className="text-[10px] text-apg-silver">Booking {selected.bookingCode}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 text-xs text-apg-silver hover:text-white"
          >
            Change
          </button>
        </div>
        {selected.tenancyStatus === 'unassigned' ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push(`/admin/bookings/new?customerId=${selected.id}`)}
              className="rounded-md bg-[#FF5A1F] px-2.5 py-1 text-[10px] font-semibold text-white"
            >
              Assign bed
            </button>
            <Link
              href={`/admin/residents/${selected.id}`}
              className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] text-apg-silver hover:text-white"
            >
              Profile
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-apg-silver">
        Step 1 — Select resident
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone, or booking code…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
          autoFocus
        />
      </label>
      {loading ? <p className="text-xs text-apg-silver">Searching…</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
          {results.map((r) => (
            <li key={r.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-white/5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-white">{r.fullName}</p>
                  <TenancyBadge status={r.tenancyStatus} />
                </div>
                <p className="text-[11px] text-apg-silver">
                  {r.phone}
                  {r.pgName && r.roomNumber
                    ? ` · ${r.pgName} · R${r.roomNumber}`
                    : ' · No bed assigned'}
                </p>
              </button>
              {r.tenancyStatus === 'unassigned' ? (
                <button
                  type="button"
                  onClick={() => router.push(`/admin/bookings/new?customerId=${r.id}`)}
                  className="shrink-0 self-center rounded-md border border-[#FF5A1F]/40 px-2 py-1 text-[10px] font-medium text-[#FF5A1F]"
                >
                  Assign
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !loading && !error ? (
        <p className="text-xs text-apg-silver">
          No residents match — try another spelling or phone number.
        </p>
      ) : null}
    </div>
  );
}
