import Link from 'next/link';
import { ApproveVacatingButton } from '@/src/components/admin/VacatingActions';
import type { PgBedMapBed } from '@/src/services/pgBedMap';

const PRIMARY =
  'flex items-center justify-between rounded-lg bg-[#FF5A1F] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'flex items-center justify-between rounded-lg border border-white/15 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/5';

type Person = NonNullable<PgBedMapBed['occupant']> | NonNullable<PgBedMapBed['reserved']>;

export function BedDetailPrimaryActions({
  pgId,
  bed,
  person,
}: {
  pgId: string;
  bed: PgBedMapBed;
  person: Person;
}) {
  const isOccupant = Boolean(bed.occupant);

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">What to do next</h3>
      <nav className="grid gap-2" aria-label="Primary bed actions">
        <Link href={`/admin/residents/${person.customerId}`} className={PRIMARY}>
          Resident profile
          <span aria-hidden>→</span>
        </Link>
        <Link href={`/admin/bookings/${person.bookingId}`} className={SECONDARY}>
          Rent &amp; bills
          <span aria-hidden>→</span>
        </Link>
        <Link href={`/admin/deposits/${person.bookingId}`} className={SECONDARY}>
          Security deposit
          <span aria-hidden>→</span>
        </Link>
        {bed.vacating?.status === 'pending' ? (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
            <p className="mb-2 text-xs text-amber-100">Move-out waiting for approval</p>
            <ApproveVacatingButton requestId={bed.vacating.requestId} pgId={pgId} />
          </div>
        ) : null}
        {isOccupant && !bed.vacating ? (
          <a href="#start-move-out" className={SECONDARY}>
            Start move-out notice
            <span aria-hidden>→</span>
          </a>
        ) : null}
        {bed.vacating?.status === 'approved' ? (
          <Link href="/admin/checkout-settlements?tab=awaiting_resident" className={PRIMARY}>
            Open checkout
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </nav>
    </section>
  );
}

export function EmptyBedPrimaryActions({ pgId, bed }: { pgId: string; bed: PgBedMapBed }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">What to do next</h3>
      <nav className="grid gap-2">
        {!bed.manualReservedCheckIn ? (
          <Link href={`/admin/bookings/new?bedId=${bed.bedId}`} className={PRIMARY}>
            Assign resident to this bed
            <span aria-hidden>→</span>
          </Link>
        ) : null}
        <Link href={`/admin/pgs/${pgId}/rooms`} className={SECONDARY}>
          Edit room &amp; pricing
          <span aria-hidden>→</span>
        </Link>
        <a href="#bed-advanced" className={SECONDARY}>
          Mark reserved or occupied
          <span aria-hidden>→</span>
        </a>
      </nav>
    </section>
  );
}
