'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDateTime, titleCase } from '@/src/lib/format';
import type { ResidentListRow } from '@/src/services/residentAdmin';

export function ResidentsTable({ residents }: { residents: ResidentListRow[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    if (!q) return residents;

    return residents.filter((r) => {
      const nameMatch = r.fullName.toLowerCase().includes(q);
      const emailMatch = r.email.toLowerCase().includes(q);
      const phoneMatch =
        digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits);
      return nameMatch || emailMatch || phoneMatch;
    });
  }, [query, residents]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block min-w-[16rem] flex-1 text-sm">
          <span className="font-medium text-zinc-700">Search residents</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or phone number…"
            className="apg-admin-field mt-1 w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-sm text-zinc-500">
          Showing {filtered.length} of {residents.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          No residents match your search.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Room / status</TH>
              <TH>Phone</TH>
              <TH>KYC</TH>
              <TH>Joined</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-zinc-900">
                  <Link href={`/admin/residents/${r.id}`} className="hover:text-[#FF5A1F]">
                    {r.fullName}
                  </Link>
                  <p className="text-xs font-normal text-zinc-500">{r.email}</p>
                </TD>
                <TD>
                  {r.tenancyStatus === 'active' && r.pgName ? (
                    <span className="text-sm">
                      {r.pgName} · Room {r.roomNumber} · {r.bedCode}
                    </span>
                  ) : (
                    <Badge tone="amber">Unassigned</Badge>
                  )}
                </TD>
                <TD>{r.phone}</TD>
                <TD>
                  <AdminKycStatusWithWhatsApp
                    kycStatus={r.kycStatus}
                    phone={r.phone}
                    customerName={r.fullName}
                    badge={
                      <Badge tone={toneForStatus(r.kycStatus)}>{titleCase(r.kycStatus)}</Badge>
                    }
                  />
                </TD>
                <TD>{formatDateTime(new Date(r.createdAt))}</TD>
                <TD className="text-right">
                  <Link
                    href={
                      r.tenancyStatus === 'active'
                        ? `/admin/residents/${r.id}`
                        : `/admin/bookings/new?customerId=${r.id}`
                    }
                    className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                  >
                    {r.tenancyStatus === 'active' ? 'Manage' : 'Assign'}
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
