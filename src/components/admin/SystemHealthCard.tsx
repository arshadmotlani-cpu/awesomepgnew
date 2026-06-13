'use client';

import Link from 'next/link';
import type { SystemHealthSnapshot } from '@/src/services/systemHealth';

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

const STATUS_STYLES: Record<SystemHealthSnapshot['uptimeStatus'], string> = {
  healthy: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  degraded: 'text-amber-200 bg-amber-500/10 border-amber-500/30',
  critical: 'text-rose-200 bg-rose-500/10 border-rose-500/30',
};

export function SystemHealthCard({
  health,
  sentryUrl,
}: {
  health: SystemHealthSnapshot;
  sentryUrl: string | null;
}) {
  const statusLabel =
    health.uptimeStatus === 'healthy'
      ? 'Healthy'
      : health.uptimeStatus === 'degraded'
        ? 'Degraded'
        : 'Critical';

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">System health</h2>
          <p className="text-xs text-apg-silver">
            Error counts from internal app logs · Sentry captures production exceptions.
          </p>
        </div>
        {sentryUrl ? (
          <Link
            href={sentryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-[#FF5A1F]/40 hover:text-[#FF5A1F]"
          >
            Open Sentry →
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
            Errors today
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {health.errorsToday.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
            Errors this week
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {health.errorsThisWeek.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 lg:col-span-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
            Last critical error
          </p>
          {health.lastCriticalError ? (
            <>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-white">
                {health.lastCriticalError.message}
              </p>
              <p className="mt-1 text-xs text-apg-silver">
                {formatTs(health.lastCriticalError.createdAt)}
                {health.lastCriticalError.route
                  ? ` · ${health.lastCriticalError.route}`
                  : ''}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-apg-silver">No errors logged yet.</p>
          )}
        </div>
      </div>

      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_STYLES[health.uptimeStatus]}`}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-current opacity-80" />
        Uptime status: {statusLabel}
      </div>
    </section>
  );
}
