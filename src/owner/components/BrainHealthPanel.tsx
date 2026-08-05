'use client';

import type { OwnerBrainHealthSnapshot } from '@/src/owner/lib/health/brainHealthSnapshot';

export function BrainHealthPanel({ health }: { health: OwnerBrainHealthSnapshot | null }) {
  if (!health) {
    return (
      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] p-4">
        <h2 className="text-sm font-semibold text-white">Brain Health</h2>
        <p className="mt-2 text-sm text-[color:var(--oo-muted,#9CA3AF)]">
          Health Brain snapshot unavailable.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Brain Health</h2>
          <p className="mt-1 text-xs text-[color:var(--oo-muted,#9CA3AF)]">
            Live integrity cards from deployed Health Brain
          </p>
        </div>
        <a
          href={health.pgHealthReportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          Full report →
        </a>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {health.cards.map((c) => (
          <a
            key={c.brain}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              c.status === 'Healthy'
                ? 'border-emerald-500/30 text-emerald-200'
                : c.status === 'Warning'
                  ? 'border-amber-500/30 text-amber-200'
                  : 'border-rose-500/30 text-rose-200'
            }`}
          >
            {c.brain} · {c.status}
          </a>
        ))}
      </div>
    </section>
  );
}
