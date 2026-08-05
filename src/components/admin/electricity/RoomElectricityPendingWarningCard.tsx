'use client';

import Link from 'next/link';
import type { RoomElectricityPendingAdminRow } from '@/src/lib/billing/roomElectricityPendingAdmin';
import { nextElectricityBillStatusLabel } from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';

export function RoomElectricityPendingWarningCard({ room }: { room: RoomElectricityPendingAdminRow }) {
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-amber-100">
            ⚠ Room {room.roomNumber}
          </p>
          <p className="text-sm text-amber-50/90">
            Electricity bill has not been generated for {room.billingMonthLabel}.
          </p>
          <dl className="grid gap-1 text-xs text-amber-100/80 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-amber-200/70">Last reading</dt>
              <dd>
                {room.lastReadingUnits != null ? `${room.lastReadingUnits} units` : '—'}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-amber-200/70">Last bill</dt>
              <dd>{room.lastBillMonthLabel ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-amber-200/70">Status</dt>
              <dd>{nextElectricityBillStatusLabel(room.nextElectricityBillStatus)}</dd>
            </div>
            {room.affectedResidents.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="font-medium text-amber-200/70">Residents affected</dt>
                <dd>{room.affectedResidents.map((r) => r.name).join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <Link
          href={room.generateHref}
          className="shrink-0 rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e54f1a]"
        >
          Generate {room.billingMonthLabel.split(' ')[0]} electricity bill
        </Link>
      </div>
    </div>
  );
}
