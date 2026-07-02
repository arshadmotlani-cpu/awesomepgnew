/** Design tokens for customer-facing UX redesign. Prefer CSS vars in globals.css for colors. */

export const elevation = {
  base: '',
  card: 'apg-elev-card rounded-2xl',
  floating: 'apg-elev-floating rounded-2xl',
} as const;

export const surface = {
  darkGlass: 'apg-glass',
  darkGlassLight: 'apg-glass-light',
  /** @deprecated Use residentGlass for V2 resident portal. */
  account: 'apg-account-surface rounded-xl border border-zinc-200 shadow-sm',
  accountPadded: 'apg-account-surface rounded-xl border border-zinc-200 shadow-sm p-5',
  /** Premium dark glass card for resident portal V2. */
  residentGlass:
    'rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md',
  residentGlassPadded:
    'rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md',
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
  maintenance: 'border-rose-500/50 bg-rose-600/15 text-rose-100',
} as const;

export const requestStatusTone = {
  submitted: 'bg-sky-500/15 text-sky-200 ring-sky-400/30',
  under_review: 'bg-amber-500/15 text-amber-200 ring-amber-400/30',
  reviewing: 'bg-amber-500/15 text-amber-200 ring-amber-400/30',
  approved: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30',
  rejected: 'bg-rose-500/15 text-rose-200 ring-rose-400/30',
  completed: 'bg-indigo-500/15 text-indigo-200 ring-indigo-400/30',
  pending: 'bg-amber-500/15 text-amber-200 ring-amber-400/30',
  paid: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30',
  overdue: 'bg-rose-500/15 text-rose-200 ring-rose-400/30',
  processing: 'bg-sky-500/15 text-sky-200 ring-sky-400/30',
} as const;

export const primaryBtn =
  'apg-glow-btn inline-flex min-h-[44px] items-center justify-center rounded-xl bg-apg-orange px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-apg-orange/40 hover:bg-white/15';
