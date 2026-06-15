'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';

type SearchResult = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  kycStatus: string;
  tenancyStatus: 'unassigned' | 'active';
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  bookingId: string | null;
};

export function KycApprovedDepositSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(
            `/api/admin/residents/search?q=${encodeURIComponent(query.trim())}&kycApproved=1`,
            { cache: 'no-store' },
          );
          const json = (await res.json()) as {
            ok: boolean;
            data?: SearchResult[];
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

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Add deposit — KYC-approved residents</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Search by name or phone. Only residents with approved KYC and an active booking appear.
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name or phone…"
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      {loading ? <p className="text-xs text-zinc-500">Searching…</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {results.length === 0 && query.trim().length >= 2 && !loading ? (
          <li className="px-3 py-4 text-sm text-zinc-500">No KYC-approved residents with active stays.</li>
        ) : null}
        {results.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">{r.fullName}</p>
              <p className="text-xs text-zinc-500">
                {r.phone} · {r.pgName ?? 'No bed'} {r.roomNumber ? `· Room ${r.roomNumber}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="emerald">KYC approved</Badge>
              {r.bookingId ? (
                <button
                  type="button"
                  onClick={() => router.push(`/admin/deposits/${r.bookingId}?add=1`)}
                  className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Add deposit →
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
