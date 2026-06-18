'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { BulkKycWhatsAppReminder } from '@/src/components/admin/BulkKycWhatsAppReminder';
import { formatDateTime, titleCase } from '@/src/lib/format';
import type { ResidentListRow } from '@/src/services/residentAdmin';

type StatusFilter = 'all' | 'active' | 'unassigned' | 'vacating' | 'kyc_pending';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'vacating', label: 'Vacating' },
  { id: 'kyc_pending', label: 'KYC pending' },
];

function statusBadge(r: ResidentListRow) {
  if (r.tenancyStatus === 'unassigned') {
    return <Badge tone="amber">Unassigned</Badge>;
  }
  if (r.tenancyStatus === 'vacating') {
    return <Badge tone="amber">Vacating</Badge>;
  }
  return (
    <span className="text-sm text-white">
      {r.pgName} · Room {r.roomNumber} · {r.bedCode}
    </span>
  );
}

export function ResidentsTable({
  residents,
  initialQuery = '',
}: {
  residents: ResidentListRow[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');

    return residents.filter((r) => {
      if (statusFilter === 'active' && r.tenancyStatus !== 'active') return false;
      if (statusFilter === 'unassigned' && r.tenancyStatus !== 'unassigned') return false;
      if (statusFilter === 'vacating' && r.tenancyStatus !== 'vacating') return false;
      if (statusFilter === 'kyc_pending' && r.kycStatus !== 'pending') return false;

      if (!q) return true;

      const nameMatch = r.fullName.toLowerCase().includes(q);
      const emailMatch = r.email.toLowerCase().includes(q);
      const phoneMatch = digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits);
      const pgMatch = r.pgName?.toLowerCase().includes(q);
      const bedMatch =
        r.bedCode?.toLowerCase().includes(q) ||
        r.roomNumber?.toLowerCase().includes(q) ||
        `${r.roomNumber ?? ''} ${r.bedCode ?? ''}`.toLowerCase().includes(q);

      return nameMatch || emailMatch || phoneMatch || pgMatch || bedMatch;
    });
  }, [query, residents, statusFilter]);

  return (
    <div className="space-y-4">
      <BulkKycWhatsAppReminder residents={residents} />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={
              statusFilter === f.id
                ? 'rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white'
                : 'rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block min-w-0 flex-1 basis-full text-sm sm:basis-auto">
          <span className="font-medium text-apg-silver">Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, PG, room, or bed…"
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
        <p className="text-sm text-apg-silver">
          Showing {filtered.length} of {residents.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
          No residents match your filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    PG / bed
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Verified via
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    KYC
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
                      <p className="text-xs text-apg-silver">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">{statusBadge(r)}</td>
                    <td className="px-4 py-3 text-apg-silver">{r.phone}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.verificationSource === 'kyc' ? 'emerald' : 'sky'}>
                        {r.verificationSource === 'kyc' ? 'KYC' : 'Payment'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <AdminKycStatusWithWhatsApp
                        kycStatus={r.kycStatus}
                        phone={r.phone}
                        customerName={r.fullName}
                        badge={
                          <Badge tone={toneForStatus(r.kycStatus)}>
                            {titleCase(r.kycStatus)}
                          </Badge>
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-apg-silver">
                      {formatDateTime(new Date(r.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={
                          r.tenancyStatus === 'unassigned'
                            ? `/admin/bookings/new?customerId=${r.id}`
                            : `/admin/residents/${r.id}`
                        }
                        className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                      >
                        {r.tenancyStatus === 'unassigned' ? 'Assign bed' : 'Manage'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
