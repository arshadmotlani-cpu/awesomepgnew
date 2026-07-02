'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { BedStatusControl } from '@/src/components/admin/bedmap/BedStatusControl';
import { BedDetailAdvancedTools } from '@/src/components/admin/bedmap/BedDetailAdvancedTools';
import { BedInlineAssignForm } from '@/src/components/admin/bedmap/BedInlineAssignForm';
import {
  BedDetailPrimaryActions,
  EmptyBedPrimaryActions,
} from '@/src/components/admin/bedmap/BedDetailPrimaryActions';
import { BedMapSummarySection } from '@/src/components/admin/bedmap/BedMapSummarySection';
import { ADMIN_BED_KIND_CLASS } from '@/src/lib/bedAvailabilityState';
import type {
  PgBedMap,
  PgBedMapBed,
  PgBedMapFloor,
  PgBedMapRoom,
} from '@/src/services/pgBedMap';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

type BedOption = { bedId: string; label: string };

type InlineAssignContext = {
  customerId: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  beds: Array<{ bedId: string; label: string; monthlyRatePaise: number; depositPaise: number }>;
  defaultStartDate: string;
  bedId: string;
};

type SelectedContext = {
  bed: PgBedMapBed;
  room: PgBedMapRoom;
  floor: PgBedMapFloor;
};

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27]';
const LEGEND_FULL = [
  { label: 'Open now', className: 'border-emerald-400/60 bg-emerald-500/15' },
  { label: 'Pre-book', className: 'border-sky-400/50 bg-sky-500/12' },
  { label: 'Move-out notice', className: 'border-orange-400/55 bg-orange-500/12' },
  { label: 'Occupied', className: 'border-zinc-500/50 bg-zinc-700/40' },
  { label: 'Booked', className: 'border-violet-400/55 bg-violet-500/15' },
  { label: 'Reserved', className: 'border-violet-400/55 bg-violet-500/15' },
  { label: 'Checkout pending', className: 'border-cyan-400/50 bg-cyan-500/12' },
  { label: 'Maintenance', className: 'border-rose-500/60 bg-rose-600/20' },
];

const COMMAND_LEGEND = [
  { label: 'Available', className: 'border-emerald-400/60 bg-emerald-500/15' },
  { label: 'Occupied', className: 'border-zinc-500/50 bg-zinc-700/40' },
  { label: 'Releasing soon', className: 'border-orange-400/55 bg-orange-500/12' },
  { label: 'Reserved', className: 'border-violet-400/55 bg-violet-500/15' },
  { label: 'Selected', className: 'border-[#FF5A1F] bg-[#FF5A1F]/20' },
];

function BedDetailPanel({
  ctx,
  pgId,
  moveBedOptions,
  onClose,
  inlineAssign,
}: {
  ctx: SelectedContext;
  pgId: string;
  moveBedOptions: BedOption[];
  onClose: () => void;
  inlineAssign?: InlineAssignContext | null;
}) {
  const { bed, room, floor } = ctx;
  const person = bed.occupant ?? bed.reserved;

  return (
    <aside className={`${SURFACE} flex max-h-[min(calc(100dvh-10rem),900px)] flex-col shadow-xl`}>
      <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
            {floor.floorLabel} · Room {room.roomNumber}
          </p>
          <h2 className="text-lg font-semibold text-white">Bed {bed.bedCode}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {bed.bedStatus === 'maintenance' ? (
              <Badge tone="rose">
                <span aria-hidden className="mr-1">
                  🔧
                </span>
                Maintenance
              </Badge>
            ) : null}
            <p className="text-xs text-apg-silver">
              {room.roomTypeName}
              {room.hasAc ? ' · AC' : ''} · {room.sharingCount}-sharing · {bed.availability.label}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm text-apg-silver hover:bg-white/5 hover:text-white"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <BedStatusControl pgId={pgId} bed={bed} />

        {person ? (
          <>
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
                {bed.occupant ? 'Living here' : 'Reserved for'}
              </p>
              <p className="mt-1 text-base font-semibold text-white">{person.customerName}</p>
              <p className="text-sm text-apg-silver">{person.customerPhone}</p>
              <p className="mt-2 text-xs text-apg-silver">
                {person.bookingCode} · {bed.occupant ? 'Move-in' : 'From'}{' '}
                {formatDate(person.moveInDate)} · {paiseToInr(person.monthlyRentPaise)}/mo
              </p>
              <p className="mt-1">
                <AdminKycStatusWithWhatsApp
                  kycStatus={person.kycStatus}
                  phone={person.customerPhone}
                  customerName={person.customerName}
                  badge={
                    <Badge tone={toneForStatus(person.kycStatus)}>
                      Identity {titleCase(person.kycStatus)}
                    </Badge>
                  }
                />
              </p>
            </section>

            <BedDetailPrimaryActions pgId={pgId} bed={bed} person={person} />
            <BedDetailAdvancedTools
              bed={bed}
              room={room}
              floor={floor}
              pgId={pgId}
              moveBedOptions={moveBedOptions}
            />
          </>
        ) : (
          <>
            <EmptyBedPrimaryActions pgId={pgId} bed={bed} />
            {inlineAssign && inlineAssign.bedId === bed.bedId ? (
              <BedInlineAssignForm
                beds={inlineAssign.beds}
                bedId={inlineAssign.bedId}
                defaultStartDate={inlineAssign.defaultStartDate}
                prefill={{
                  customerId: inlineAssign.customerId,
                  fullName: inlineAssign.fullName,
                  email: inlineAssign.email,
                  phone: inlineAssign.phone,
                  gender: inlineAssign.gender,
                }}
              />
            ) : null}
            <BedDetailAdvancedTools
              bed={bed}
              room={room}
              floor={floor}
              pgId={pgId}
              moveBedOptions={moveBedOptions}
            />
          </>
        )}
      </div>
    </aside>
  );
}

function RoomCard({
  room,
  selectedBedId,
  onSelectBed,
}: {
  room: PgBedMapRoom;
  selectedBedId: string | null;
  onSelectBed: (bedId: string) => void;
}) {
  const openCount = room.beds.filter((b) => b.isAvailableNow).length;
  const occupiedCount = room.beds.filter((b) => b.isOccupiedToday || b.manualOccupied).length;

  return (
    <article className={`${SURFACE} flex flex-col gap-4 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
            {room.floorLabel} · Room {room.roomNumber}
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-white">{room.roomTypeName}</h3>
          <p className="text-xs text-apg-silver">
            {room.sharingCount}-sharing · {room.hasAc ? 'AC' : 'Non-AC'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30 ring-inset">
          {openCount} open · {occupiedCount}/{room.beds.length} in
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
        {room.beds.map((bed) => {
          const selected = selectedBedId === bed.bedId;
          const kindClass = ADMIN_BED_KIND_CLASS[bed.availability.kind];
          const isMaintenance = bed.bedStatus === 'maintenance';
          return (
            <button
              key={bed.bedId}
              type="button"
              onClick={() => onSelectBed(bed.bedId)}
              aria-pressed={selected}
              className={`relative box-border flex min-h-[104px] w-full min-w-0 max-w-full flex-col items-center justify-center rounded-xl border-2 px-2 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A1F] ${
                selected
                  ? 'border-[#FF5A1F] ring-2 ring-inset ring-[#FF5A1F]/40'
                  : kindClass
              }`}
            >
              {isMaintenance ? (
                <span className="absolute right-1.5 top-1.5 text-[11px]" aria-hidden title="Maintenance">
                  🔧
                </span>
              ) : null}
              <span className="text-sm font-bold uppercase tracking-wide">{bed.bedCode}</span>
              <span className="mt-1.5 text-[11px] font-medium leading-snug opacity-95">
                {bed.availability.label}
              </span>
              {bed.availability.sublabel ? (
                <span className="mt-1 text-[10px] leading-snug opacity-80">
                  {bed.availability.sublabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </article>
  );
}

export function PgBedMapPanel({
  map,
  moveBedOptions,
  hideSummary = false,
  commandCenterMode = false,
  initialSelectedBedId = null,
  inlineAssign = null,
}: {
  map: PgBedMap;
  moveBedOptions: BedOption[];
  hideSummary?: boolean;
  commandCenterMode?: boolean;
  initialSelectedBedId?: string | null;
  inlineAssign?: InlineAssignContext | null;
}) {
  const [selectedBedId, setSelectedBedId] = useState<string | null>(initialSelectedBedId);

  function selectBed(bedId: string) {
    setSelectedBedId(bedId);
  }

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
      <div className={`${SURFACE} border-dashed px-6 py-12 text-center text-sm text-apg-silver`}>
        No beds yet. Add them under{' '}
        <Link href={`/admin/pgs/${map.pgId}/rooms`} className="font-semibold text-[#FF5A1F] hover:underline">
          Rooms & electricity
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!hideSummary ? <BedMapSummarySection summary={map.summary} /> : null}

      <div className="flex flex-wrap gap-3 text-[11px] text-apg-silver">
        {(commandCenterMode ? COMMAND_LEGEND : LEGEND_FULL).map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-5 rounded border ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          {map.floors.map((floor) => (
            <section key={floor.floorNumber}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-apg-silver">
                {floor.floorLabel}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {floor.rooms.map((room) => (
                  <RoomCard
                    key={room.roomId}
                    room={room}
                    selectedBedId={selectedBedId}
                    onSelectBed={selectBed}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          {selectedCtx ? (
            <BedDetailPanel
              ctx={selectedCtx}
              pgId={map.pgId}
              moveBedOptions={moveBedOptions}
              onClose={() => setSelectedBedId(null)}
              inlineAssign={inlineAssign}
            />
          ) : (
            <div className={`${SURFACE} border-dashed px-4 py-10 text-center text-sm text-apg-silver`}>
              Tap a bed to assign a resident, start move-out, or change rooms.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
