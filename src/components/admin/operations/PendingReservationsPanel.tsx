'use client';

import Link from 'next/link';
import type { PendingReservationRow } from '@/src/services/pendingReservations';
import { paiseToInr } from '@/src/lib/format';

function formatExpiry(iso: Date | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '—';
  }
}

export function PendingReservationsPanel({ rows }: { rows: PendingReservationRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Pending Reservations ({rows.length})
          </h2>
          <p className="mt-1 text-sm text-apg-silver">
            Residents selected a bed but have not uploaded payment proof yet. No admin approval
            required until proof is submitted.
          </p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10 bg-[#1A1F27]">
        {rows.map((row) => (
          <li
            key={row.bookingId}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium text-white">{row.customerName}</p>
              <p className="text-apg-silver">
                {row.pgName}
                {row.roomNumber || row.bedCode
                  ? ` · ${[row.roomNumber ? `Room ${row.roomNumber}` : null, row.bedCode ? `Bed ${row.bedCode}` : null]
                      .filter(Boolean)
                      .join(' · ')}`
                  : ''}
              </p>
              <p className="text-xs text-amber-200/80">
                Hold expires {formatExpiry(row.holdExpiresAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white">{paiseToInr(row.totalPaise)}</span>
              <Link
                href={`/admin/bookings/${row.bookingId}`}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver transition hover:border-apg-orange/40 hover:text-white"
              >
                View booking
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
