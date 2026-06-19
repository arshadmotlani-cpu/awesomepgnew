/** Design tokens for customer-facing UX redesign. Prefer CSS vars in globals.css for colors. */

export const elevation = {
  base: '',
  card: 'apg-elev-card rounded-2xl',
  floating: 'apg-elev-floating rounded-2xl',
} as const;

export const surface = {
  darkGlass: 'apg-glass',
  darkGlassLight: 'apg-glass-light',
  account: 'apg-account-surface rounded-xl border border-zinc-200 shadow-sm',
  accountPadded: 'apg-account-surface rounded-xl border border-zinc-200 shadow-sm p-5',
} as const;

export const typography = {
  display: 'font-semibold tracking-tight',
  body: 'text-sm leading-relaxed',
  caption: 'text-xs text-apg-silver',
  tabular: 'tabular-nums',
} as const;

export const spacing = {
  section: 'py-16 sm:py-20',
  stack: 'space-y-6',
  gridGap: 'gap-4',
} as const;

export const bedStateTone = {
  available: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  occupied: 'border-zinc-400/30 bg-zinc-500/15 text-zinc-200',
  reserved: 'border-amber-400/40 bg-amber-500/15 text-amber-100',
  selected: 'border-apg-orange bg-apg-orange/25 text-white ring-2 ring-apg-orange/50',
  notice: 'border-sky-400/40 bg-sky-500/15 text-sky-100',
} as const;

export const requestStatusTone = {
  submitted: 'bg-sky-50 text-sky-700 ring-sky-200',
  under_review: 'bg-amber-50 text-amber-700 ring-amber-200',
  reviewing: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  completed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
} as const;

export const primaryBtn =
  'apg-glow-btn inline-flex min-h-[44px] items-center justify-center rounded-xl bg-apg-orange px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-apg-orange/40 hover:bg-white/15';
