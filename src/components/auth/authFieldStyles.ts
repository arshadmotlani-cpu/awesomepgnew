/**
 * Auth form fields always render on light surfaces. Explicit colors + scheme-light
 * keep entered text readable when the OS prefers dark mode (globals.css sets a
 * light body foreground there, which would otherwise wash out on white inputs).
 */
export const authInputClassName =
  'apg-field-input mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 shadow-sm placeholder:text-zinc-400 caret-indigo-600 transition-[border-color,box-shadow] focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-500 scheme-light';

export const authSelectClassName =
  'apg-field-input mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 shadow-sm transition-[border-color,box-shadow] focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 scheme-light';

export const authFieldLabelClassName =
  'text-xs font-medium uppercase tracking-wide text-zinc-600';
