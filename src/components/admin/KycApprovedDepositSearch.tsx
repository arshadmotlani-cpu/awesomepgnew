'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { titleCase } from '@/src/lib/format';

type SearchResult = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  kycStatus: string;
  tenancyStatus: 'unassigned' | 'active' | 'vacating';
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
    <div className="w-full space-y-4 rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Add deposit — verified residents</h3>
        <p className="mt-1 text-sm text-apg-silver">
          Search by name or phone. Shows verified residents (KYC or payment approved) with an active
          booking.
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name or phone…"
        className="apg-admin-field w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
      />
      {loading ? <p className="text-xs text-apg-silver">Searching…</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
        {results.length === 0 && query.trim().length >= 2 && !loading ? (
          <li className="px-3 py-4 text-sm text-apg-silver">
            No verified residents with an active booking match your search.
          </li>
        ) : null}
        {results.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 hover:bg-white/[0.03]"
          >
            <div>
              <p className="text-sm font-medium text-white">{r.fullName}</p>
              <p className="text-xs text-apg-silver">
                {r.phone} · {r.pgName ?? 'No bed'}{' '}
                {r.roomNumber ? `· Room ${r.roomNumber} · ${r.bedCode}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={toneForStatus(r.kycStatus)}>{titleCase(r.kycStatus)} KYC</Badge>
              {r.bookingId ? (
                <button
                  type="button"
                  onClick={() => router.push(`/admin/deposits/${r.bookingId}?add=1`)}
                  className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Add deposit →
                </button>
              ) : (
                <span className="text-xs text-apg-silver">No active booking</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
