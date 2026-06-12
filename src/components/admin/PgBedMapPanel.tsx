'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { BedMapMoveForm } from '@/src/components/admin/BedMapMoveForm';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import {
  ApproveVacatingButton,
  CompleteVacatingButton,
  RejectVacatingButton,
} from '@/src/components/admin/VacatingActions';
import type {
  PgBedMap,
  PgBedMapBed,
  PgBedMapFloor,
  PgBedMapRoom,
  PgBedMapSummary,
} from '@/src/services/pgBedMap';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

type BedOption = { bedId: string; label: string };

type SelectedContext = {
  bed: PgBedMapBed;
  room: PgBedMapRoom;
  floor: PgBedMapFloor;
};

function bedTileClass(bed: PgBedMapBed, selected: boolean): string {
  const base =
    'relative flex min-h-[72px] flex-col items-center justify-center rounded-lg border-2 px-2 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A1F] focus-visible:ring-offset-2';

  if (selected) {
    return `${base} border-[#FF5A1F] bg-[#FF5A1F]/10 shadow-md`;
  }

  if (bed.bedStatus === 'maintenance') {
    return `${base} border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-400`;
  }
  if (bed.bedStatus === 'blocked') {
    return `${base} border-rose-300 bg-rose-50 text-rose-900 hover:border-rose-400`;
  }
  if (bed.isOccupiedToday) {
    if (bed.vacating) {
      return `${base} border-orange-400 bg-orange-50 text-orange-950 hover:border-orange-500`;
    }
    if (bed.billing.rentOverdueCount > 0) {
      return `${base} border-rose-400 bg-rose-50 text-rose-950 hover:border-rose-500`;
    }
    return `${base} border-emerald-400 bg-emerald-50 text-emerald-950 hover:border-emerald-500`;
  }
  return `${base} border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50`;
}

function ActionLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 transition hover:border-[#FF5A1F]/40 hover:bg-[#FF5A1F]/5"
    >
      {children}
      <span className="text-zinc-400">→</span>
    </Link>
  );
}

function SummaryStrip({ summary }: { summary: PgBedMapSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {[
        { label: 'Total beds', value: summary.totalBeds, tone: 'text-zinc-900' },
        { label: 'Occupied', value: summary.occupiedBeds, tone: 'text-emerald-700' },
        { label: 'Vacant', value: summary.vacantBeds, tone: 'text-zinc-600' },
        { label: 'Maintenance', value: summary.maintenanceBeds, tone: 'text-amber-700' },
        { label: 'Blocked', value: summary.blockedBeds, tone: 'text-rose-700' },
        { label: 'Vacating soon', value: summary.vacatingSoon, tone: 'text-orange-700' },
      ].map((item) => (
        <div key={item.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{item.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.tone}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function BedDetailPanel({
  ctx,
  pgId,
  moveBedOptions,
  onClose,
}: {
  ctx: SelectedContext;
  pgId: string;
  moveBedOptions: BedOption[];
  onClose: () => void;
}) {
  const { bed, room, floor } = ctx;
  const occ = bed.occupant;

  return (
    <aside className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white shadow-lg">
      <div className="flex items-start justify-between border-b border-zinc-100 px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {floor.floorLabel} · Room {room.roomNumber}
          </p>
          <h2 className="text-lg font-semibold text-zinc-900">{bed.bedCode}</h2>
          <p className="text-xs text-zinc-500">
            {room.roomTypeName}
            {room.hasAc ? ' · AC' : ''} · {room.sharingCount}-sharing
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          {bed.isOccupiedToday ? (
            <Badge tone="emerald">Occupied</Badge>
          ) : bed.bedStatus === 'available' ? (
            <Badge tone="zinc">Vacant</Badge>
          ) : (
            <Badge tone={bed.bedStatus === 'maintenance' ? 'amber' : 'rose'}>
              {titleCase(bed.bedStatus)}
            </Badge>
          )}
          {bed.vacating ? (
            <Badge tone="amber">Vacating {formatDate(bed.vacating.vacatingDate)}</Badge>
          ) : null}
          {bed.billing.rentOverdueCount > 0 ? (
            <Badge tone="rose">{bed.billing.rentOverdueCount} rent overdue</Badge>
          ) : null}
        </div>

        {occ ? (
          <>
            <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resident</p>
              <p className="mt-1 text-base font-semibold text-zinc-900">{occ.customerName}</p>
              <p className="text-sm text-zinc-600">{occ.customerPhone}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Booking{' '}
                <span className="font-mono font-medium text-zinc-800">{occ.bookingCode}</span> · Move-in{' '}
                {formatDate(occ.moveInDate)} · {paiseToInr(occ.monthlyRentPaise)}/mo
              </p>
              <p className="mt-1">
                <Badge tone={toneForStatus(occ.kycStatus)}>KYC {titleCase(occ.kycStatus)}</Badge>
              </p>
            </section>

            <nav className="grid gap-2" aria-label="Resident actions">
              <ActionLink href={`/admin/residents/${occ.customerId}`}>Resident profile</ActionLink>
              <ActionLink href={`/admin/bookings/${occ.bookingId}`}>
                Booking — rent, electricity & payments
              </ActionLink>
              <ActionLink href={`/admin/deposits/${occ.bookingId}`}>Deposit ledger</ActionLink>
              <ActionLink href="/admin/rent">All rent invoices</ActionLink>
              <ActionLink href={`/admin/pgs/${pgId}/rooms`}>Room meter & electricity setup</ActionLink>
              <ActionLink href="/admin/vacating">Vacating queue</ActionLink>
              {occ.kycStatus !== 'approved' ? (
                <ActionLink href="/admin/kyc">KYC review</ActionLink>
              ) : null}
            </nav>

            {bed.vacating ? (
              <section className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">
                  Vacating request
                </p>
                <p className="mt-1 text-sm text-orange-950">
                  {titleCase(bed.vacating.status)} · leaves {formatDate(bed.vacating.vacatingDate)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bed.vacating.status === 'pending' ? (
                    <>
                      <ApproveVacatingButton requestId={bed.vacating.requestId} />
                      <RejectVacatingButton requestId={bed.vacating.requestId} />
                    </>
                  ) : null}
                  {bed.vacating.status === 'approved' ? (
                    <CompleteVacatingButton requestId={bed.vacating.requestId} />
                  ) : null}
                </div>
              </section>
            ) : null}

            <BedMapMoveForm
              pgId={pgId}
              bookingId={occ.bookingId}
              customerId={occ.customerId}
              currentBedId={bed.bedId}
              beds={moveBedOptions}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              This bed is free. Assign a tenant or update inventory status from the booking tools.
            </p>
            <nav className="grid gap-2">
              <ActionLink href={`/admin/bookings/new?bedId=${bed.bedId}`}>Assign tenant to this bed</ActionLink>
              <ActionLink href={`/admin/pgs/${pgId}/rooms`}>Edit room & pricing setup</ActionLink>
            </nav>
          </>
        )}
      </div>
    </aside>
  );
}

export function PgBedMapPanel({
  map,
  moveBedOptions,
}: {
  map: PgBedMap;
  moveBedOptions: BedOption[];
}) {
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);

  const selectedCtx = useMemo((): SelectedContext | null => {
    if (!selectedBedId) return null;
    for (const floor of map.floors) {
      for (const room of floor.rooms) {
        const bed = room.beds.find((b) => b.bedId === selectedBedId);
        if (bed) return { bed, room, floor };
      }
    }
    return null;
  }, [map.floors, selectedBedId]);

  if (map.floors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center text-sm text-zinc-600">
        No beds configured yet. Add floors, rooms, and beds under{' '}
        <Link href={`/admin/pgs/${map.pgId}/rooms`} className="font-semibold text-[#FF5A1F] hover:underline">
          Rooms & electricity
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryStrip summary={map.summary} />

      <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-emerald-400 bg-emerald-50" /> Occupied
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-orange-400 bg-orange-50" /> Vacating
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-rose-400 bg-rose-50" /> Rent overdue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-zinc-200 bg-white" /> Vacant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-amber-300 bg-amber-50" /> Maintenance
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {map.floors.map((floor) => (
            <section key={floor.floorNumber}>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {floor.floorLabel}
              </h2>
              <div className="space-y-4">
                {floor.rooms.map((room) => (
                  <article
                    key={room.roomId}
                    className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-zinc-900">Room {room.roomNumber}</h3>
                        <p className="text-xs text-zinc-500">
                          {room.roomTypeName}
                          {room.hasAc ? ' · AC' : ''}
                        </p>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {room.beds.filter((b) => b.isOccupiedToday).length}/{room.beds.length} occupied
                      </p>
                    </header>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {room.beds.map((bed) => {
                        const isSelected = selectedBedId === bed.bedId;
                        const occupantLabel = bed.occupant?.customerName.split(' ')[0];
                        return (
                          <button
                            key={bed.bedId}
                            type="button"
                            onClick={() => setSelectedBedId(bed.bedId)}
                            className={bedTileClass(bed, isSelected)}
                            aria-pressed={isSelected}
                          >
                            <span className="text-xs font-bold uppercase tracking-wide">{bed.bedCode}</span>
                            {bed.isOccupiedToday && occupantLabel ? (
                              <span className="mt-1 line-clamp-2 text-[11px] font-medium leading-tight">
                                {occupantLabel}
                              </span>
                            ) : (
                              <span className="mt-1 text-[10px] uppercase tracking-wide opacity-70">
                                {bed.bedStatus === 'available' ? 'Free' : titleCase(bed.bedStatus)}
                              </span>
                            )}
                            {bed.vacating ? (
                              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-500" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="xl:sticky xl:top-28 xl:self-start">
          {selectedCtx ? (
            <BedDetailPanel
              ctx={selectedCtx}
              pgId={map.pgId}
              moveBedOptions={moveBedOptions}
              onClose={() => setSelectedBedId(null)}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
              Click a bed to see who lives there and manage rent, vacating, deposits, or room moves.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
