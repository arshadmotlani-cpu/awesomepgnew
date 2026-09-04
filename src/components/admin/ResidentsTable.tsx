'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { BulkKycWhatsAppReminder } from '@/src/components/admin/BulkKycWhatsAppReminder';
import { formatDate, titleCase } from '@/src/lib/format';
import {
  assignedBedShortLabel,
  isResidentBedAssignable,
  isResidentBedAssigned,
  viewBedAdminHref,
} from '@/src/lib/residentBedAssignment';
import {
  filterResidentsForAdminList,
  matchesResidentListStatusFilter,
  parseResidentListStatusFilter,
  RESIDENT_LIST_STATUS_FILTERS,
  type ResidentListStatusFilter,
} from '@/src/lib/residents/residentListPresentation';
import { ResidentLifecycleBadge } from '@/src/lib/residents/residentLifecycleBadge';
import type { ResidentListRow } from '@/src/services/residentAdmin';

function statusBadge(r: ResidentListRow) {
  if (isResidentBedAssigned(r)) {
    const label = assignedBedShortLabel(r);
    return (
      <span className="text-sm text-white">
        {r.pgName ?? 'Assigned'}
        {label ? ` · ${label}` : ''}
        {r.tenancyStatus === 'vacating' ? (
          <span className="ml-2 inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-100">
            Vacating{r.vacatingDate ? ` · ${formatDate(r.vacatingDate)}` : ''}
          </span>
        ) : null}
      </span>
    );
  }
  if (r.tenancyStatus === 'unassigned') {
    return <Badge tone="amber">Unassigned</Badge>;
  }
  if (r.tenancyStatus === 'vacating') {
    return (
      <span className="text-sm text-white">
        {r.pgName} · Room {r.roomNumber} · {r.bedCode}
        {r.vacatingDate ? (
          <span className="mt-0.5 block text-xs text-amber-200/90">
            Move-out: {formatDate(r.vacatingDate)}
          </span>
        ) : null}
      </span>
    );
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
  initialMoveInDate = '',
  initialStatusFilter,
}: {
  residents: ResidentListRow[];
  initialQuery?: string;
  initialMoveInDate?: string;
  initialStatusFilter?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [moveInDate, setMoveInDate] = useState(initialMoveInDate);
  const [statusFilter, setStatusFilter] = useState<ResidentListStatusFilter>(() =>
    parseResidentListStatusFilter(initialStatusFilter),
  );

  const statusMatched = useMemo(
    () => residents.filter((r) => matchesResidentListStatusFilter(r, statusFilter)),
    [residents, statusFilter],
  );

  const filtered = useMemo(
    () =>
      filterResidentsForAdminList(residents, {
        statusFilter,
        query,
        moveInDate,
      }),
    [query, residents, statusFilter, moveInDate],
  );

  function applyStatusFilter(next: ResidentListStatusFilter) {
    setStatusFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'active') params.delete('status');
    else params.set('status', next);
    const qs = params.toString();
    router.replace(`/admin/residents${qs ? `?${qs}` : ''}`);
  }

  function openResidentProfile(customerId: string) {
    startTransition(() => {
      router.push(`/admin/residents/${customerId}`);
    });
  }

  function applyMoveInFilter(date: string) {
    setMoveInDate(date);
    const params = new URLSearchParams(searchParams.toString());
    if (date) params.set('moveIn', date);
    else params.delete('moveIn');
    router.replace(`/admin/residents${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="space-y-4">
      <BulkKycWhatsAppReminder residents={residents} />

      <div className="flex flex-wrap gap-2">
        {RESIDENT_LIST_STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => applyStatusFilter(f.id)}
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
        <label className="block min-w-0 flex-1 basis-full text-sm sm:basis-auto sm:max-w-xs">
          <span className="font-medium text-apg-silver">Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, PG, room, or bed…"
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-sm sm:max-w-[11rem]">
          <span className="font-medium text-apg-silver">Check-in date</span>
          <input
            type="date"
            value={moveInDate}
            onChange={(e) => applyMoveInFilter(e.target.value)}
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
        {moveInDate ? (
          <button
            type="button"
            onClick={() => applyMoveInFilter('')}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
          >
            Clear date
          </button>
        ) : null}
        <p className="text-sm text-apg-silver">
          Showing {filtered.length} of {statusMatched.length}
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
                    Check-in
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Verified via
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Lifecycle
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    KYC
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={`cursor-pointer transition hover:bg-white/[0.04] ${isNavigating ? 'pointer-events-none opacity-80' : ''}`}
                    onClick={() => openResidentProfile(r.id)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/residents/${r.id}`}
                        prefetch
                        className="block font-medium text-white hover:text-[#FF5A1F]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.fullName}
                      </Link>
                      <p className="text-xs text-apg-silver">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">{statusBadge(r)}</td>
                    <td className="px-4 py-3 text-apg-silver">
                      {r.moveInDate ? formatDate(r.moveInDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-apg-silver">{r.phone}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.verificationSource === 'kyc' ? 'emerald' : 'sky'}>
                        {r.verificationSource === 'kyc' ? 'KYC' : 'Payment'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ResidentLifecycleBadge resident={r} />
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
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {isResidentBedAssignable(r) ? (
                        <Link
                          href={`/admin/beds?customerId=${r.id}`}
                          className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                        >
                          Assign bed
                        </Link>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {viewBedAdminHref(r) ? (
                            <Link
                              href={viewBedAdminHref(r)!}
                              className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                            >
                              View bed
                            </Link>
                          ) : null}
                          <Link
                            href={`/admin/residents/${r.id}`}
                            className="text-xs text-apg-silver hover:text-white"
                          >
                            Manage
                          </Link>
                        </div>
                      )}
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
