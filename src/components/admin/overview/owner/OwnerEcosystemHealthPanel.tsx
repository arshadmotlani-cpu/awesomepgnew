import Link from 'next/link';
import type { EcosystemHealthSnapshot } from '@/src/services/ownerDashboard';

export function OwnerEcosystemHealthPanel({
  snapshot,
}: {
  snapshot: EcosystemHealthSnapshot | null;
}) {
  if (!snapshot) {
    return (
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
        <h2 className="text-sm font-semibold text-white">Ecosystem Health</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Snapshot unavailable — open{' '}
          <Link href="/admin/system/health-report" className="text-[#FF5A1F] hover:underline">
            System health report
          </Link>
          .
        </p>
      </section>
    );
  }

  const tone =
    snapshot.overallHealthPct >= 90
      ? 'text-emerald-300'
      : snapshot.overallHealthPct >= 70
        ? 'text-amber-200'
        : 'text-rose-200';

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Ecosystem Health</h2>
          <p className="mt-1 text-xs text-apg-silver">
            Brain integrity command snapshot — under 10 seconds to read.
          </p>
        </div>
        <Link
          href="/admin/system/health-report"
          className="rounded-lg border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 px-3 py-1.5 text-xs font-semibold text-[#FF5A1F] hover:bg-[#FF5A1F]/20"
        >
          Open Health Report →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Overall health</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
            {snapshot.overallHealthPct}%
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Brain health</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {snapshot.brainHealthPct}%
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">
            Production integrity
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {snapshot.productionIntegrityPct}%
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-apg-silver">Open issues</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {snapshot.openIssues}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-apg-silver lg:grid-cols-4">
        <p>
          Auto repairs today:{' '}
          <span className="font-semibold text-white">{snapshot.autoRepairsToday}</span>
        </p>
        <p>
          Manual required:{' '}
          <span className="font-semibold text-white">{snapshot.manualRepairsRequired}</span>
        </p>
        <p>
          Last audit:{' '}
          <span className="font-semibold text-white">
            {snapshot.lastAuditAt
              ? new Intl.DateTimeFormat('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(snapshot.lastAuditAt))
              : '—'}
          </span>
        </p>
        <p>
          Last critical:{' '}
          <span className="font-semibold text-white line-clamp-2">
            {snapshot.lastCriticalCause ?? 'None'}
          </span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {snapshot.byBrain.map((b) => (
          <Link
            key={b.brain}
            href={`/admin/system/health-report?brain=${encodeURIComponent(b.brain)}`}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              b.status === 'Healthy'
                ? 'border-emerald-500/30 text-emerald-200'
                : b.status === 'Warning'
                  ? 'border-amber-500/30 text-amber-200'
                  : 'border-rose-500/30 text-rose-200'
            }`}
          >
            {b.brain} · {b.status}
          </Link>
        ))}
      </div>
    </section>
  );
}
