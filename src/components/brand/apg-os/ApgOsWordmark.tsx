import { APG_OS, APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';

type ApgOsWordmarkProps = {
  surface?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  showTagline?: boolean;
  className?: string;
};

const sizeClass = {
  sm: { title: 'text-[13px]', sub: 'text-[9px]', tag: 'text-[8px]' },
  md: { title: 'text-[15px]', sub: 'text-[9px]', tag: 'text-[8px]' },
  lg: { title: 'text-lg', sub: 'text-[10px]', tag: 'text-[10px]' },
} as const;

/** Typographic lockup — “APG OS” reads as one product name. */
export function ApgOsWordmark({
  surface = 'dark',
  size = 'md',
  showSubtitle = true,
  showTagline = false,
  className,
}: ApgOsWordmarkProps) {
  const onLight = surface === 'light';
  const t = sizeClass[size];

  return (
    <div className={['min-w-0 leading-none', className].filter(Boolean).join(' ')}>
      <p
        className={`${t.title} font-semibold ${onLight ? 'text-slate-900' : 'text-white'}`}
        style={{ letterSpacing: APG_OS_BRAND.typography.wordmarkTracking }}
      >
        <span className="whitespace-nowrap">
          {APG_OS.nameParts.apg}
          <span className="font-semibold opacity-95"> </span>
          {APG_OS.nameParts.os}
        </span>
      </p>
      {showSubtitle ? (
        <p
          className={`${t.sub} mt-1 font-medium uppercase ${onLight ? 'text-slate-500' : 'text-apg-silver'}`}
          style={{ letterSpacing: APG_OS_BRAND.typography.subtitleTracking }}
        >
          {APG_OS.subtitle}
        </p>
      ) : null}
      {showTagline ? (
        <p
          className={`${t.tag} mt-2 font-medium uppercase ${onLight ? 'text-slate-400' : 'text-apg-silver/75'}`}
          style={{ letterSpacing: APG_OS_BRAND.typography.taglineTracking }}
        >
          {APG_OS.tagline}
        </p>
      ) : null}
    </div>
  );
}
