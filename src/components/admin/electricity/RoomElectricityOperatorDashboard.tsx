import { formatDate, paiseToInr } from '@/src/lib/format';
import type { RoomElectricityOperatorView } from '@/src/lib/billing/buildRoomElectricityOperatorView';
import { RoomElectricityResidentCard } from '@/src/components/admin/electricity/RoomElectricityResidentCard';

type Props = {
  operator: RoomElectricityOperatorView;
};

export function RoomElectricityOperatorDashboard({ operator }: Props) {
  const o = operator;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/[0.08] bg-[#1A1F27]/80 p-5 ring-1 ring-white/[0.04]">
        <p className="text-xs font-semibold uppercase tracking-wider text-apg-silver">
          Room electricity
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          {o.pgName} · Room {o.roomNumber} · {formatDate(o.billingMonth)}
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-apg-silver">Units consumed</dt>
            <dd className="text-sm font-medium text-white">{o.unitsConsumed}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Rate per unit</dt>
            <dd className="text-sm font-medium text-white">{paiseToInr(o.ratePerUnitPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Room bill total</dt>
            <dd className="text-sm font-medium text-white">{paiseToInr(o.grossTotalPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Residents</dt>
            <dd className="text-sm font-medium text-white">
              {o.residentCount}
              {o.generatedAt ? ` · generated ${formatDate(o.generatedAt.slice(0, 10))}` : ''}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-apg-silver">
          Residents ({o.residents.length})
        </h3>
        {o.residents.map((resident) => (
          <RoomElectricityResidentCard key={resident.bookingId} resident={resident} />
        ))}
      </div>
    </section>
  );
}
