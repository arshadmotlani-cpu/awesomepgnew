'use client';

import { useRouter } from 'next/navigation';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { useAdminResidentSearch } from '@/src/hooks/useAdminResidentSearch';
import { titleCase } from '@/src/lib/format';

export function KycApprovedDepositSearch() {
  const router = useRouter();
  const { query, setQuery, results, loading, error, showEmpty } = useAdminResidentSearch({
    kycApprovedOnly: true,
  });

  return (
    <div className="w-full space-y-4 rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Add deposit — verified residents</h3>
        <p className="mt-1 text-sm text-apg-silver">
          Search by name or phone. Shows KYC-approved residents — with or without an active bed.
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
        {showEmpty ? (
          <li className="px-3 py-4 text-sm text-apg-silver">No residents found.</li>
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
                <button
                  type="button"
                  onClick={() => router.push(`/admin/residents/${r.id}`)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-apg-silver hover:text-white"
                >
                  Open profile
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
