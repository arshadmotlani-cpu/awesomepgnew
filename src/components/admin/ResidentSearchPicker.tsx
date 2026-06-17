'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';

type SearchResult = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  tenancyStatus: 'unassigned' | 'active' | 'vacating' | 'vacated' | 'blocked';
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
};

export function ResidentSearchPicker({
  selectedCustomerId,
  selectedName,
  bedId,
}: {
  selectedCustomerId?: string;
  selectedName?: string;
  bedId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
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
          const json = (await res.json()) as { ok: boolean; data?: SearchResult[]; error?: string };
          if (!res.ok || !json.ok) {
            setError(json.error ?? 'Search failed.');
            setResults([]);
            return;
          }
          setResults(json.data ?? []);
        } catch {
          setError('Search failed. Try again.');
          setResults([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  function assignHref(customerId: string) {
    const params = new URLSearchParams({ customerId });
    if (bedId) params.set('bedId', bedId);
    return `/admin/bookings/new?${params.toString()}`;
  }

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Find resident</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Search all residents by name, phone, or booking code — assigned and unassigned.
        </p>
      </div>

      {selectedCustomerId && selectedName ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span>
            Selected: <strong className="text-emerald-900">{selectedName}</strong>
          </span>
          <div className="flex gap-3">
            <Link
              href={`/admin/residents/${selectedCustomerId}`}
              className="font-semibold text-[#FF5A1F] hover:underline"
            >
              View profile
            </Link>
            <button
              type="button"
              onClick={() => router.push('/admin/bookings/new')}
              className="text-zinc-600 hover:text-zinc-900"
            >
              Change
            </button>
          </div>
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="sr-only">Search residents</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or phone number…"
          className="apg-admin-field w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          autoFocus={!selectedCustomerId}
        />
      </label>

      {loading ? <p className="text-sm text-zinc-500">Searching…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {query.trim().length >= 2 && !loading && results.length === 0 && !error ? (
        <p className="text-sm text-zinc-500">
          No residents match — try another spelling or phone number.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">{r.fullName}</p>
                <p className="text-xs text-zinc-500">
                  {r.phone} · {r.email}
                </p>
                <p className="mt-1">
                  {r.tenancyStatus === 'active' || r.tenancyStatus === 'vacating' ? (
                    r.pgName ? (
                      <Badge tone="emerald">
                        {r.tenancyStatus === 'vacating' ? 'Vacating · ' : ''}
                        Room {r.roomNumber} · {r.bedCode}
                      </Badge>
                    ) : (
                      <Badge tone="emerald">Occupied</Badge>
                    )
                  ) : (
                    <Badge tone="amber">Unassigned</Badge>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/admin/residents/${r.id}`}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Profile
                </Link>
                {r.tenancyStatus === 'active' || r.tenancyStatus === 'vacating' ? (
                  <Link
                    href={`/admin/residents/${r.id}`}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-900"
                  >
                    Manage
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push(assignHref(r.id))}
                    className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                  >
                    Assign bed
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-zinc-500">
        Or browse everyone on{' '}
        <Link href="/admin/residents" className="font-semibold text-[#FF5A1F] hover:underline">
          Residents
        </Link>
        .
      </p>
    </div>
  );
}
