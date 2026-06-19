import type { BedAssignmentCommandStats, PgAvailabilityRow } from '@/src/lib/beds/bedAssignmentCommand';

export function BedAvailabilityCommandCenter({
  stats,
  pgRows,
}: {
  stats: BedAssignmentCommandStats;
  pgRows: PgAvailabilityRow[];
}) {
  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-white">Availability command center</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Which PG has free beds — and what needs assignment first.
        </p>
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Free beds now" value={String(stats.freeBedsNow)} accent="free" />
        <Metric label="Releasing in 7 days" value={String(stats.releasingWithin7Days)} accent="release" />
        <Metric label="Waiting assignments" value={String(stats.waitingAssignments)} accent="wait" />
        <Metric label="Occupancy" value={`${stats.occupancyPct}%`} />
        <Metric label="Rooms with 1 bed left" value={String(stats.roomsWithOneBedLeft)} accent="bottleneck" />
      </dl>

      {pgRows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-apg-silver">
              <tr>
                <th className="px-4 py-3">PG</th>
                <th className="px-4 py-3 text-right">Free now</th>
                <th className="px-4 py-3 text-right">Releasing soon</th>
                <th className="px-4 py-3 text-right">Occupancy</th>
                <th className="px-4 py-3 text-right">Waiting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pgRows.map((pg) => (
                <tr key={pg.pgId} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium text-white">{pg.pgName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{pg.freeBeds}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-200">{pg.releasingSoon}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pg.occupancyPct}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pg.waitingCount || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'free' | 'release' | 'wait' | 'bottleneck';
}) {
  const valueClass =
    accent === 'free'
      ? 'text-emerald-300'
      : accent === 'release'
        ? 'text-amber-200'
        : accent === 'wait'
          ? 'text-[#FF5A1F]'
          : accent === 'bottleneck'
            ? 'text-sky-300'
            : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-2 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}
