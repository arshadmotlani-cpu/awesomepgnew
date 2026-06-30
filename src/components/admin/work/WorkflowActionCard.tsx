import Link from 'next/link';
import type { TodaysWorkCard } from '@/src/lib/admin/todaysWorkPresentation';

const TONE_STYLES = {
  orange: 'bg-orange-500/10 text-orange-200 ring-orange-400/30',
  blue: 'bg-sky-500/10 text-sky-200 ring-sky-400/30',
  green: 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30',
  red: 'bg-rose-500/10 text-rose-200 ring-rose-400/30',
  neutral: 'bg-white/5 text-apg-silver ring-white/10',
} as const;

export function WorkflowActionCard({ card, compact }: { card: TodaysWorkCard; compact?: boolean }) {
  const showPrimary = !card.waitingOnResident && card.priority !== 'completed_today';

  return (
    <article className="rounded-3xl bg-[#1A1F27]/80 p-6 shadow-sm ring-1 ring-white/[0.06] backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">{card.workflowLabel}</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-white">{card.residentName}</h3>
          {card.roomBed ? (
            <p className="mt-1 text-sm text-apg-silver">{card.roomBed}</p>
          ) : card.pgName ? (
            <p className="mt-1 text-sm text-apg-silver">{card.pgName}</p>
          ) : null}
        </div>
        <span
          className={
            'inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ' +
            TONE_STYLES[card.statusTone]
          }
        >
          {card.statusLabel}
        </span>
      </div>

      {card.summaryLines.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-apg-silver">
          {card.summaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {(card.residentChecks.length > 0 || card.adminChecks.length > 0) && !compact ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {card.residentChecks.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">Resident</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {card.residentChecks.map((item) => (
                  <li key={item.label} className={item.done ? 'text-emerald-300' : 'text-apg-silver'}>
                    {item.done ? '✓' : '○'} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {card.adminChecks.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">You</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {card.adminChecks.map((item) => (
                  <li
                    key={item.label}
                    className={
                      item.done
                        ? 'text-emerald-300'
                        : item.label.includes('Calculate')
                          ? 'text-orange-200'
                          : 'text-apg-silver'
                    }
                  >
                    {item.done ? '✓' : item.label.includes('Calculate') ? '⚠' : '○'} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">Next step</p>
          <p className="mt-1 text-sm text-white">{card.nextStep}</p>
          {card.estimatedMinutes > 0 ? (
            <p className="mt-1 text-xs text-apg-silver">About {card.estimatedMinutes} min</p>
          ) : null}
        </div>
        {showPrimary ? (
          <Link
            href={card.continueHref}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-[#FF5A1F] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(255,90,31,0.25)] transition hover:brightness-110"
          >
            {card.continueLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
