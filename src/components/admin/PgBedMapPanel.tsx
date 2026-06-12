'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { BedMapManualOccupiedToggle } from '@/src/components/admin/BedMapManualOccupiedToggle';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { AdminVacatingSubmitForm } from '@/src/components/admin/AdminVacatingSubmitForm';
import { BedMapMoveForm } from '@/src/components/admin/BedMapMoveForm';
import { BedMapReservationForm } from '@/src/components/admin/BedMapReservationForm';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import {
  ApproveVacatingButton,
  CancelVacatingNoticeButton,
  CompleteVacatingButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
} from '@/src/components/admin/VacatingActions';
import { ADMIN_BED_KIND_CLASS } from '@/src/lib/bedAvailabilityState';
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

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27]';
const LEGEND = [
  { label: 'Open now', className: 'border-emerald-400/60 bg-emerald-500/15' },
  { label: 'Pre-book', className: 'border-sky-400/50 bg-sky-500/12' },
  { label: 'Notice', className: 'border-orange-400/55 bg-orange-500/12' },
  { label: 'Occupied', className: 'border-zinc-500/50 bg-zinc-700/40' },
  { label: 'Booked', className: 'border-violet-400/55 bg-violet-500/15' },
  { label: 'Checkout pending', className: 'border-cyan-400/50 bg-cyan-500/12' },
  { label: 'Maintenance', className: 'border-amber-400/50 bg-amber-500/12' },
];

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium text-white transition hover:border-[#FF5A1F]/40 hover:bg-[#FF5A1F]/10"
    >
      {children}
      <span className="text-apg-silver">→</span>
    </Link>
  );
}

function SummaryStrip({ summary }: { summary: PgBedMapSummary }) {
  const items = [
    { label: 'Total', value: summary.totalBeds, tone: 'text-white' },
    { label: 'Occupied', value: summary.occupiedBeds, tone: 'text-zinc-300' },
    { label: 'Open now', value: summary.openNowBeds, tone: 'text-sky-300' },
    { label: 'Reserved', value: summary.reservedBeds, tone: 'text-violet-300' },
    { label: 'Vacating', value: summary.vacatingSoon, tone: 'text-orange-300' },
    { label: 'Maint / blocked', value: summary.maintenanceBeds + summary.blockedBeds, tone: 'text-amber-300' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className={`${SURFACE} px-4 py-3`}>
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
            {item.label}
          </p>
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
  const person = bed.occupant ?? bed.reserved;

  return (
    <aside className={`${SURFACE} flex max-h-[calc(100vh-8rem)] flex-col shadow-xl`}>
      <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
            {floor.floorLabel} · Room {room.roomNumber}
          </p>
          <h2 className="text-lg font-semibold text-white">{bed.bedCode}</h2>
          <p className="text-xs text-apg-silver">
            {room.roomTypeName}
            {room.hasAc ? ' · AC' : ''} · {room.sharingCount}-sharing
          </p>
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
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-sm font-semibold text-white">{bed.availability.label}</p>
          {bed.availability.sublabel ? (
            <p className="text-xs text-apg-silver">{bed.availability.sublabel}</p>
          ) : null}
          {bed.availability.kind === 'notice' && bed.availability.sublabel?.includes('interested') ? (
            <p className="mt-2 text-xs font-medium text-orange-200">
              Website interest is counted when someone taps this notice bed — one person per visitor.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone={bed.isOccupiedToday ? 'emerald' : bed.manualOccupied ? 'zinc' : bed.reserved ? 'violet' : 'zinc'}>
            {bed.isOccupiedToday
              ? 'Living here'
              : bed.manualOccupied
                ? 'Occupied'
                : bed.reserved
                  ? 'Reserved'
                  : titleCase(bed.bedStatus)}
          </Badge>
          {bed.vacating ? (
            <Badge tone="amber">Vacating {formatDate(bed.vacating.vacatingDate)}</Badge>
          ) : null}
          {bed.billing.rentOverdueCount > 0 ? (
            <Badge tone="rose">{bed.billing.rentOverdueCount} rent overdue</Badge>
          ) : null}
        </div>

        {person ? (
          <>
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
                {bed.occupant ? 'Resident' : 'Reserved for'}
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
                      KYC {titleCase(person.kycStatus)}
                    </Badge>
                  }
                />
              </p>
            </section>

            <nav className="grid gap-2" aria-label="Resident actions">
              <ActionLink href={`/admin/residents/${person.customerId}`}>Resident profile</ActionLink>
              <ActionLink href={`/admin/bookings/${person.bookingId}`}>
                Booking · rent & electricity
              </ActionLink>
              <ActionLink href={`/admin/deposits/${person.bookingId}`}>Deposit ledger</ActionLink>
              <ActionLink href={`/admin/pgs/${pgId}/rooms`}>Room meter & bills</ActionLink>
            </nav>

            {bed.vacating ? (
              <section className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-200">
                  Vacating · {titleCase(bed.vacating.status)}
                </p>
                <p className="mt-1 text-sm text-orange-50">
                  Leaves {formatDate(bed.vacating.vacatingDate)} · deduction{' '}
                  {paiseToInr(bed.vacating.deductionPaise)}
                </p>
                {bed.vacating.status === 'approved' ? (
                  <p className="mt-1 text-xs text-orange-100/80">
                    Website pre-booking is open from this date.
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {bed.vacating.status === 'pending' ? (
                    <>
                      <ApproveVacatingButton requestId={bed.vacating.requestId} pgId={pgId} />
                      <RejectVacatingButton requestId={bed.vacating.requestId} pgId={pgId} />
                    </>
                  ) : null}
                  {bed.vacating.status === 'approved' ? (
                    <>
                      <CompleteVacatingButton requestId={bed.vacating.requestId} pgId={pgId} />
                      <UndoVacatingApprovalButton requestId={bed.vacating.requestId} pgId={pgId} />
                    </>
                  ) : null}
                  {bed.vacating.status === 'pending' || bed.vacating.status === 'approved' ? (
                    <CancelVacatingNoticeButton requestId={bed.vacating.requestId} pgId={pgId} />
                  ) : null}
                </div>
              </section>
            ) : bed.occupant ? (
              <AdminVacatingSubmitForm
                pgId={pgId}
                bookingId={person.bookingId}
                monthlyRentPaise={person.monthlyRentPaise}
                hasExistingVacating={Boolean(bed.vacating)}
              />
            ) : null}

            {bed.occupant ? (
              <>
                <BedMapMoveForm
                  pgId={pgId}
                  bookingId={person.bookingId}
                  customerId={person.customerId}
                  currentBedId={bed.bedId}
                  beds={moveBedOptions}
                />
                <BedMapReservationForm
                  pgId={pgId}
                  bookingId={person.bookingId}
                  mode="shift_to_reservation"
                />
              </>
            ) : null}

            {bed.reserved && !bed.occupant ? (
              <BedMapReservationForm
                pgId={pgId}
                bookingId={person.bookingId}
                mode="activate_now"
                reservedFrom={bed.reservedFrom}
              />
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm text-apg-silver">
              {bed.manualOccupied
                ? 'Bed is marked occupied — customers cannot book it. Open it again when you want it listed.'
                : 'Bed is open — assign a tenant or mark as reserved for someone who has not moved in yet.'}
            </p>
            {bed.bedStatus === 'available' ? (
              <BedMapManualOccupiedToggle
                pgId={pgId}
                bedId={bed.bedId}
                bedCode={bed.bedCode}
                manualOccupied={bed.manualOccupied}
              />
            ) : null}
            <nav className="grid gap-2">
              {!bed.manualOccupied ? (
                <ActionLink href={`/admin/bookings/new?bedId=${bed.bedId}`}>
                  Assign / reserve tenant
                </ActionLink>
              ) : null}
              <ActionLink href={`/admin/pgs/${pgId}/rooms`}>Edit room & pricing</ActionLink>
            </nav>
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
  const occupiedCount = room.beds.filter((b) => b.isOccupiedToday).length;

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
      <SummaryStrip summary={map.summary} />

      <div className="flex flex-wrap gap-3 text-[11px] text-apg-silver">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-5 rounded border ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
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
                    onSelectBed={setSelectedBedId}
                  />
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
            <div className={`${SURFACE} border-dashed px-4 py-10 text-center text-sm text-apg-silver`}>
              Tap a bed to manage the resident, file vacating, shift rooms, or open billing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
