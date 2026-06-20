import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import type { ResidencyJourneyState } from '@/src/lib/residents/residencyJourney';

const STATUS_ICON: Record<string, string> = {
  done: '✓',
  pending: '⏳',
  locked: '🔒',
};

type Props = {
  journey: ResidencyJourneyState;
};

export function ResidencyJourneyModule({ journey }: Props) {
  return (
    <section id="journey" className="scroll-mt-24">
      <ApgCard tier="account" className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Your Stay Journey</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Track move-in progress from account setup to active stay.
        </p>

        <ol className="mt-5 space-y-3">
          {journey.steps.map((step, index) => (
            <li
              key={step.id}
              className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-zinc-700 ring-1 ring-zinc-200">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">
                  {step.label}{' '}
                  <span className="ml-1 text-base" aria-hidden>
                    {STATUS_ICON[step.status]}
                  </span>
                </p>
                <p className="text-[11px] capitalize text-zinc-500">{step.status}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-xl border border-apg-orange/25 bg-orange-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-apg-orange">
            Next action
          </p>
          <p className="mt-1 text-sm text-zinc-800">
            Waiting for: <strong>{journey.waitingFor}</strong>
          </p>
          <Link
            href={journey.nextActionHref}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-apg-orange px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            → {journey.nextActionLabel}
          </Link>
        </div>
      </ApgCard>
    </section>
  );
}
