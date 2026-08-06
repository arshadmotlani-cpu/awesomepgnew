'use client';

import { formatDate } from '@/src/lib/format';
import type { ExitTimelineEvent } from '@/src/lib/exit/exitBrainTimeline';

type Theme = 'light' | 'dark';

export function ExitBrainTimeline({
  events,
  theme = 'light',
  title = 'Move-out timeline',
}: {
  events: ExitTimelineEvent[];
  theme?: Theme;
  title?: string;
}) {
  const dark = theme === 'dark';
  const shell = dark
    ? 'rounded-xl border border-white/10 bg-white/[0.03]'
    : 'rounded-xl border border-zinc-200 bg-zinc-50';
  const heading = dark ? 'text-white' : 'text-zinc-900';
  const muted = dark ? 'text-apg-silver' : 'text-zinc-600';

  return (
    <section className={`${shell} p-4 sm:p-5`}>
      <h3 className={`text-sm font-semibold ${heading}`}>{title}</h3>
      <ol className="mt-4 space-y-0">
        {events.map((event, index) => {
          const done = event.status === 'done';
          const skipped = event.status === 'skipped';
          const dateLabel = event.occurredAt ? formatDate(event.occurredAt.slice(0, 10)) : null;

          return (
            <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < events.length - 1 ? (
                <span
                  className={`absolute left-[7px] top-4 h-[calc(100%-8px)] w-px ${
                    dark ? 'bg-white/10' : 'bg-zinc-200'
                  }`}
                />
              ) : null}
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : skipped
                      ? dark
                        ? 'border-white/20 text-apg-silver'
                        : 'border-zinc-300 text-zinc-400'
                      : dark
                        ? 'border-white/30 bg-white/5'
                        : 'border-zinc-300 bg-white'
                }`}
              >
                {done ? '✓' : ''}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    skipped ? muted : done ? heading : muted
                  }`}
                >
                  {event.label}
                </p>
                {dateLabel ? (
                  <p className={`text-xs ${muted}`}>{dateLabel}</p>
                ) : !done && !skipped ? (
                  <p className={`text-xs ${muted}`}>Pending</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
