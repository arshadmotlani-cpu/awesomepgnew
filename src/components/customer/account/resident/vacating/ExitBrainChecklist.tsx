'use client';

import type { ExitChecklistItem } from '@/src/lib/exit/exitBrainChecklist';

type Theme = 'light' | 'dark';

export function ExitBrainChecklist({
  items,
  theme = 'light',
  title = 'Move-out checklist',
}: {
  items: ExitChecklistItem[];
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
      <ul className="mt-4 space-y-2">
        {items.map((item) => {
          const done = item.status === 'done';
          const blocked = item.status === 'blocked';

          return (
            <li key={item.id} className="flex items-start gap-3 text-sm">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : blocked
                      ? dark
                        ? 'border-white/15 text-apg-silver'
                        : 'border-zinc-200 text-zinc-300'
                      : dark
                        ? 'border-white/30'
                        : 'border-zinc-300'
                }`}
              >
                {done ? '✓' : ''}
              </span>
              <div>
                <p className={done ? heading : muted}>{item.label}</p>
                {item.hint ? <p className={`text-xs ${muted}`}>{item.hint}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
