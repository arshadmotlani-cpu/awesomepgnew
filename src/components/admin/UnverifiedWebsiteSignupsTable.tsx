'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { formatDateTime, titleCase } from '@/src/lib/format';
import type { UnverifiedWebsiteSignupRow } from '@/src/services/residentAdmin';

export function UnverifiedWebsiteSignupsTable({
  signups,
}: {
  signups: UnverifiedWebsiteSignupRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    if (!q) return signups;
    return signups.filter((r) => {
      const nameMatch = r.fullName.toLowerCase().includes(q);
      const emailMatch = r.email.toLowerCase().includes(q);
      const phoneMatch = digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits);
      const bedMatch =
        r.bedCode?.toLowerCase().includes(q) ||
        r.roomNumber?.toLowerCase().includes(q);
      return nameMatch || emailMatch || phoneMatch || bedMatch;
    });
  }, [query, signups]);

  const assignedCount = signups.filter((r) => r.bookingId).length;

  if (signups.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <strong>{signups.length}</strong> website signup{signups.length === 1 ? '' : 's'} waiting
        for verification — approve <strong>KYC</strong> or a <strong>payment</strong> to move them
        into Residents.
        {assignedCount > 0 ? (
          <>
            {' '}
            <strong className="text-rose-200">{assignedCount}</strong>{' '}
            {assignedCount === 1 ? 'has' : 'have'} a bed on the map — review below.
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Website signups (not verified)</h2>
          <p className="mt-1 text-sm text-apg-silver">
            People who registered on awesomepg.in but have no approved KYC or payment yet.
          </p>
        </div>
        <label className="block min-w-[14rem] text-sm">
          <span className="sr-only">Search signups</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="apg-admin-field w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-amber-400/20 bg-[#1A1F27]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Name
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Bed on map
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  KYC
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Payment
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Joined
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer transition hover:bg-white/[0.04]"
                  onClick={() => router.push(`/admin/residents/${r.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{r.fullName}</p>
                    <p className="text-xs text-apg-silver">
                      {r.phone} · {r.email}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {r.bookingId && r.pgName ? (
                      <Badge tone="rose">
                        {r.pgName} · Room {r.roomNumber} · {r.bedCode}
                      </Badge>
                    ) : (
                      <span className="text-apg-silver">No bed</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={toneForStatus(r.kycStatus)}>{titleCase(r.kycStatus)}</Badge>
                    {r.hasPendingKycSubmission ? (
                      <p className="mt-1 text-[11px] text-amber-200">Awaiting review</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.hasPendingPayment ? (
                      <Badge tone="amber">Pending approval</Badge>
                    ) : (
                      <span className="text-apg-silver">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-apg-silver">
                    {formatDateTime(new Date(r.createdAt))}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href="/admin/residents/kyc"
                        className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                      >
                        KYC
                      </Link>
                      <Link
                        href="/admin/collections"
                        className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                      >
                        Payments
                      </Link>
                      <Link
                        href={`/admin/residents/${r.id}`}
                        className="text-xs font-semibold text-white hover:underline"
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
