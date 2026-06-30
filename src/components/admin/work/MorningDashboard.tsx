import Link from 'next/link';
import type { TodaysWorkCard } from '@/src/lib/admin/todaysWorkPresentation';
import { WorkflowActionCard } from '@/src/components/admin/work/WorkflowActionCard';

export function MorningDashboard({
  greeting,
  adminName,
  attentionCount,
  estimatedMinutes,
  previewCards,
  operationsHref,
}: {
  greeting: string;
  adminName: string;
  attentionCount: number;
  estimatedMinutes: number;
  previewCards: TodaysWorkCard[];
  operationsHref: string;
}) {
  const firstName = adminName.split(/\s+/)[0] || adminName;

  return (
    <div className="space-y-10">
      <section className="rounded-[2rem] bg-gradient-to-br from-[#1A1F27] to-[#12161C] px-8 py-10 sm:px-12 sm:py-14">
        <p className="text-sm font-medium text-apg-silver">{greeting},</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{firstName}</h1>

        <div className="mt-10 max-w-xl">
          <h2 className="text-lg font-medium text-white">Today&apos;s work</h2>
          {attentionCount === 0 ? (
            <p className="mt-3 text-2xl font-semibold text-emerald-300">You&apos;re all caught up.</p>
          ) : (
            <>
              <p className="mt-3 text-3xl font-semibold text-white">
                {attentionCount} resident{attentionCount === 1 ? '' : 's'} need your attention
              </p>
              <p className="mt-2 text-sm text-apg-silver">
                Estimated time: about {Math.max(1, estimatedMinutes)} minute
                {estimatedMinutes === 1 ? '' : 's'}
              </p>
            </>
          )}
        </div>

        {attentionCount > 0 ? (
          <Link
            href={operationsHref}
            className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[#FF5A1F] px-8 py-3 text-base font-semibold text-white shadow-[0_12px_40px_rgba(255,90,31,0.3)] transition hover:brightness-110"
          >
            Start working
          </Link>
        ) : (
          <Link
            href="/admin/analytics"
            className="mt-8 inline-flex items-center text-sm font-medium text-apg-silver hover:text-white"
          >
            View analytics →
          </Link>
        )}
      </section>

      {previewCards.length > 0 ? (
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Today&apos;s queue</h2>
            <Link href={operationsHref} className="text-sm font-medium text-[#FF5A1F] hover:underline">
              See all →
            </Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {previewCards.map((card) => (
              <WorkflowActionCard key={card.id} card={card} compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
