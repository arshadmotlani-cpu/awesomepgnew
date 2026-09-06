import Link from 'next/link';
import {
  RENT_PAYMENT_MAP_STATUS_LABEL,
  type RentPaymentMapStatus,
} from '@/src/lib/billing/rentPaymentMapStatus';
import type { RentPaymentMapData } from '@/src/services/rentPaymentMap';

const STATUS_TILE_CLASS: Record<RentPaymentMapStatus, string> = {
  paid: 'border-emerald-400/50 bg-emerald-500/10',
  payment_submitted: 'border-amber-400/50 bg-amber-500/10',
  not_paid: 'border-rose-400/50 bg-rose-500/10',
  available: 'border-zinc-500/40 bg-zinc-700/25',
};

const STATUS_TEXT_CLASS: Record<RentPaymentMapStatus, string> = {
  paid: 'text-emerald-300',
  payment_submitted: 'text-amber-300',
  not_paid: 'text-rose-300',
  available: 'text-apg-silver',
};

function BedTile({
  bedCode,
  residentName,
  status,
  clickHref,
}: {
  bedCode: string;
  residentName: string | null;
  status: RentPaymentMapStatus;
  clickHref: string;
}) {
  const label = RENT_PAYMENT_MAP_STATUS_LABEL[status];
  const displayName =
    status === 'available' ? 'Empty' : (residentName ?? 'Resident').split(' ')[0];

  return (
    <Link
      href={clickHref}
      className={`block rounded-lg border p-3 transition hover:brightness-110 ${STATUS_TILE_CLASS[status]}`}
    >
      <p className="text-xs font-semibold text-white">{bedCode}</p>
      <p className="mt-1 truncate text-sm text-white/90">{displayName}</p>
      <p className={`mt-2 text-[10px] font-bold uppercase tracking-wide ${STATUS_TEXT_CLASS[status]}`}>
        {label}
      </p>
    </Link>
  );
}

export function RentPaymentMapPanel({ data }: { data: RentPaymentMapData }) {
  if (data.pgs.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-8 text-center text-apg-silver">
        No PGs or beds found for this filter.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {data.pgs.map((pg) => (
        <section key={pg.pgId}>
          <h2 className="mb-4 text-lg font-bold uppercase tracking-wide text-white">{pg.pgName}</h2>
          <div className="space-y-6">
            {pg.floors.map((floor) => (
              <div key={`${pg.pgId}-${floor.floorNumber}`}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-apg-silver">
                  {floor.floorLabel}
                </h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {floor.rooms.map((room) => (
                    <article
                      key={room.roomId}
                      className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
                    >
                      <header className="mb-3 border-b border-white/5 pb-3">
                        <h4 className="text-sm font-bold text-white">Room {room.roomNumber}</h4>
                        <p className="mt-1 text-[11px] text-apg-silver">
                          {room.summary.total} beds · Paid: {room.summary.paid} · Submitted:{' '}
                          {room.summary.submitted} · Not paid: {room.summary.notPaid}
                        </p>
                      </header>
                      <div className="grid grid-cols-2 gap-2">
                        {room.beds.map((bed) => (
                          <BedTile
                            key={bed.bedId}
                            bedCode={bed.bedCode}
                            residentName={bed.residentName}
                            status={bed.status}
                            clickHref={bed.clickHref}
                          />
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
