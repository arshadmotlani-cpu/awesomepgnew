'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SearchResult = {
  id: string;
  fullName: string;
  phone: string;
  tenancyStatus: 'unassigned' | 'active';
};

export function CollectionsHistoricalPaymentPanel() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(q: string) {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/residents/search?q=${encodeURIComponent(q.trim())}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as { ok: boolean; data?: SearchResult[] };
      setResults(json.ok ? (json.data ?? []) : []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
          Payment
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
          B · Historical payments
        </h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-apg-silver">
        Backdated entries only — for money collected before the platform existed. Does{' '}
        <strong className="text-white">not</strong> create invoices or affect billing cycles.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-xs text-apg-silver">
          Find resident
          <input
            type="search"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              void search(v);
            }}
            placeholder="Name or phone"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      {loading ? <p className="mt-2 text-xs text-apg-silver">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-[#12161C]">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() =>
                  router.push(`/admin/residents/${r.id}?expressCollection=1`)
                }
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                <span className="text-white">{r.fullName}</span>
                <span className="text-xs text-apg-silver">{r.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
