import Link from 'next/link';
import type { BrainCardSummary } from '@/src/lib/health/healthBrain';

const STATUS_TONE: Record<BrainCardSummary['status'], string> = {
  Healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  Warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  Critical: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
};

export function BrainIntegrityCards({ cards }: { cards: BrainCardSummary[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">Brain integrity</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Resident, Booking, Finance, Electricity, Operations, and Health — click a card for
          filtered issues.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.brain}
            href={card.href}
            className={`rounded-xl border p-4 transition hover:border-[#FF5A1F]/40 ${STATUS_TONE[card.status]}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">{card.brain} Brain</h3>
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {card.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-white/80">
              {card.issueCount === 0
                ? 'No open issues'
                : `${card.issueCount} issue(s) · P0 ${card.openP0} · P1 ${card.openP1} · P2 ${card.openP2}`}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
