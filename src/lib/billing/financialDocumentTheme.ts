export type FinancialDocumentVariant = 'admin' | 'resident';

export function shellClasses(variant: FinancialDocumentVariant): string {
  if (variant === 'resident') {
    return 'rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-sm print:border-zinc-300 print:shadow-none';
  }
  return 'rounded-2xl border border-white/10 bg-[#1A1F27] text-white shadow-lg print:border-zinc-300 print:bg-white print:text-zinc-900 print:shadow-none';
}

export function mutedClass(variant: FinancialDocumentVariant): string {
  return variant === 'resident' ? 'text-zinc-500' : 'text-apg-silver print:text-zinc-500';
}

export function dividerClass(variant: FinancialDocumentVariant): string {
  return variant === 'resident' ? 'border-zinc-200' : 'border-white/10 print:border-zinc-200';
}

export function emphasisTextClass(variant: FinancialDocumentVariant): string {
  return variant === 'resident' ? 'text-zinc-900' : 'text-white print:text-zinc-900';
}

export function brandAccentClass(): string {
  return 'text-[#FF5A1F] print:text-zinc-700';
}
