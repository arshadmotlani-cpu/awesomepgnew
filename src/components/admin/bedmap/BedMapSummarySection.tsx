import type { PgBedMapSummary } from '@/src/services/pgBedMap';

export function BedMapSummarySection({ summary }: { summary: PgBedMapSummary }) {
  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Bed map summary</h2>
        <p className="mt-1 text-sm text-apg-silver">Tap a bed to assign a resident or manage move-out.</p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total beds" value={String(summary.totalBeds)} />
        <Stat label="Occupied" value={String(summary.occupiedBeds)} />
        <Stat label="Open now" value={String(summary.openNowBeds)} accent="sky" />
        <Stat label="Moving out soon" value={String(summary.vacatingSoon)} accent="amber" />
      </dl>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'sky' | 'amber';
}) {
  const valueClass =
    accent === 'sky' ? 'text-sky-300' : accent === 'amber' ? 'text-amber-300' : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}
