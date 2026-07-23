/** @deprecated Use FinancialDocumentSurface — kept for invoice backward compat */
export type FinancialDocumentVariant = 'admin' | 'resident';

export type FinancialDocumentSurface = 'adminPage' | 'adminModal' | 'resident';

export function resolveSurface(
  surface?: FinancialDocumentSurface,
  variant?: FinancialDocumentVariant,
): FinancialDocumentSurface {
  if (surface) return surface;
  if (variant === 'resident') return 'resident';
  return 'adminPage';
}

export function shellClasses(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  const surface =
    surfaceOrVariant === 'admin' || surfaceOrVariant === 'resident'
      ? resolveSurface(undefined, surfaceOrVariant)
      : surfaceOrVariant;

  if (surface === 'resident' || surface === 'adminModal') {
    return 'rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-sm print:border-zinc-300 print:shadow-none';
  }
  return 'rounded-2xl border border-white/10 bg-[#1A1F27] text-white shadow-lg print:border-zinc-300 print:bg-white print:text-zinc-900 print:shadow-none';
}

export function mutedClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  const surface =
    surfaceOrVariant === 'admin' || surfaceOrVariant === 'resident'
      ? resolveSurface(undefined, surfaceOrVariant)
      : surfaceOrVariant;

  if (surface === 'resident' || surface === 'adminModal') {
    return 'text-zinc-500 print:text-zinc-500';
  }
  return 'text-apg-silver print:text-zinc-500';
}

export function dividerClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  const surface =
    surfaceOrVariant === 'admin' || surfaceOrVariant === 'resident'
      ? resolveSurface(undefined, surfaceOrVariant)
      : surfaceOrVariant;

  if (surface === 'resident' || surface === 'adminModal') {
    return 'border-zinc-200 print:border-zinc-200';
  }
  return 'border-white/10 print:border-zinc-200';
}

export function emphasisTextClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  const surface =
    surfaceOrVariant === 'admin' || surfaceOrVariant === 'resident'
      ? resolveSurface(undefined, surfaceOrVariant)
      : surfaceOrVariant;

  if (surface === 'resident' || surface === 'adminModal') {
    return 'text-zinc-900 print:text-zinc-900';
  }
  return 'text-white print:text-zinc-900';
}

export function pgNameClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  const surface =
    surfaceOrVariant === 'admin' || surfaceOrVariant === 'resident'
      ? resolveSurface(undefined, surfaceOrVariant)
      : surfaceOrVariant;

  if (surface === 'resident' || surface === 'adminModal') {
    return 'text-zinc-800 print:text-zinc-900';
  }
  return 'text-white print:text-zinc-900';
}

export function brandAccentClass(): string {
  return 'text-[#FF5A1F] print:text-zinc-700';
}

export function isLightSurface(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): boolean {
  const surface =
    surfaceOrVariant === 'admin' || surfaceOrVariant === 'resident'
      ? resolveSurface(undefined, surfaceOrVariant)
      : surfaceOrVariant;
  return surface === 'resident' || surface === 'adminModal';
}

export function amountPositiveClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  return isLightSurface(surfaceOrVariant)
    ? 'text-emerald-700 print:text-emerald-700'
    : 'text-emerald-200 print:text-emerald-700';
}

export function amountDeductClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  return isLightSurface(surfaceOrVariant)
    ? 'text-rose-700 print:text-rose-700'
    : 'text-rose-200 print:text-rose-700';
}

export function amountPendingClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  return isLightSurface(surfaceOrVariant)
    ? 'text-amber-700 italic print:text-amber-800'
    : 'text-amber-200/90 italic print:text-amber-800';
}

export function disclaimerShellClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  return isLightSurface(surfaceOrVariant)
    ? 'border-amber-200 bg-amber-50 text-amber-950 print:border-amber-200 print:bg-amber-50'
    : 'border-amber-400/25 bg-amber-500/[0.08] text-amber-100 print:border-amber-200 print:bg-amber-50 print:text-amber-950';
}

export function heroMetricShellClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  return isLightSurface(surfaceOrVariant)
    ? 'rounded-xl border border-zinc-200 bg-zinc-50 p-3 print:border-zinc-200'
    : 'rounded-xl border border-white/10 bg-white/[0.03] p-3 print:border-zinc-200 print:bg-zinc-50';
}

export function collapsibleShellClass(surfaceOrVariant: FinancialDocumentSurface | FinancialDocumentVariant): string {
  return isLightSurface(surfaceOrVariant)
    ? 'rounded-xl border border-zinc-200 bg-zinc-50/80'
    : 'rounded-xl border border-white/10 bg-white/[0.02] print:border-zinc-200';
}
