/** Light cards/forms on the dark customer shell — always set foreground explicitly. */
export const ACCOUNT_SURFACE = 'apg-account-surface rounded-xl border border-zinc-200 shadow-sm';

export const ACCOUNT_SURFACE_PADDED = `${ACCOUNT_SURFACE} p-5`;

export const ACCOUNT_PAGE_TITLE =
  'text-2xl font-semibold tracking-tight text-white';

export const ACCOUNT_PAGE_SUBTITLE = 'mt-1 text-sm text-apg-silver';

export const ACCOUNT_BACK_LINK =
  'text-xs font-medium text-apg-cyan hover:text-[#FF5A1F]';

export const ACCOUNT_LINK_ON_DARK =
  'font-medium text-apg-cyan hover:text-[#FF5A1F]';

export const ACCOUNT_LINK_IN_SURFACE =
  'font-medium text-indigo-700 hover:text-indigo-600';

export const ACCOUNT_LABEL = 'text-zinc-600';

export const ACCOUNT_MUTED = 'text-zinc-600';

export const ACCOUNT_VALUE = 'font-medium text-zinc-900';

export const ACCOUNT_TABLE_HEAD =
  'bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-600';

/** Orange primary CTA on white/zinc account cards — pairs with `.apg-surface-primary` in globals.css. */
export const ACCOUNT_SURFACE_PRIMARY_BTN =
  'apg-surface-primary inline-flex items-center justify-center rounded-md bg-apg-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

export const ACCOUNT_SURFACE_DANGER_BTN =
  'inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60';
