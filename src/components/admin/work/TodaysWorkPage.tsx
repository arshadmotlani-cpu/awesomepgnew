import Link from 'next/link';
import type { TodaysWorkCard } from '@/src/lib/admin/todaysWorkPresentation';
import { groupCardsByBand } from '@/src/lib/admin/todaysWorkPresentation';
import { WorkflowActionCard } from '@/src/components/admin/work/WorkflowActionCard';

export function TodaysWorkPage({
  cards,
  estimatedMinutes,
  attentionCount,
}: {
  cards: TodaysWorkCard[];
  estimatedMinutes: number;
  attentionCount: number;
}) {
  const groups = groupCardsByBand(cards);

  return (
    <div className="space-y-10">
      <section className="rounded-[2rem] bg-[#1A1F27]/60 px-8 py-8 ring-1 ring-white/[0.05]">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Today&apos;s work</h1>
        <p className="mt-2 max-w-2xl text-sm text-apg-silver">
          {attentionCount === 0
            ? 'Nothing needs you right now. Residents waiting on their own steps are listed last.'
            : `${attentionCount} item${attentionCount === 1 ? '' : 's'} need you — about ${Math.max(1, estimatedMinutes)} minutes total.`}
        </p>
        <p className="mt-4 text-xs text-apg-silver">
          Payment proofs live in{' '}
          <Link href="/admin/operations?filter=payment_proof" className="text-[#FF5A1F] hover:underline">
            payment reviews
          </Link>
          . Numbers and trends are in{' '}
          <Link href="/admin/analytics" className="text-[#FF5A1F] hover:underline">
            analytics
          </Link>
          .
        </p>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-3xl bg-emerald-500/10 px-8 py-16 text-center ring-1 ring-emerald-400/20">
          <p className="text-xl font-semibold text-emerald-100">All clear for today</p>
          <p className="mt-2 text-sm text-emerald-200/80">Check back later or review analytics.</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.band}>
            <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-apg-silver">
              {group.label}
              <span className="ml-2 font-normal text-white">({group.cards.length})</span>
            </h2>
            <div className="grid gap-5">
              {group.cards.map((card) => (
                <WorkflowActionCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
