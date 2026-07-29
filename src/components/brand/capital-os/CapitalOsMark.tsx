import {
  CAPITAL_OS_BARS,
  CAPITAL_OS_BASELINE,
  CAPITAL_OS_VIEWBOX,
} from '@/src/lib/brand/capitalOsIconGeometry';
import { CAPITAL_OS_BRAND } from '@/src/lib/brand/capitalOsTokens';

export type CapitalOsIconStyle = 'filled' | 'light' | 'monochrome';
export type CapitalOsIconSurface = 'dark' | 'light';

type CapitalOsMarkProps = {
  size?: number;
  style?: CapitalOsIconStyle;
  surface?: CapitalOsIconSurface;
  className?: string;
  title?: string;
};

function palette(style: CapitalOsIconStyle, surface: CapitalOsIconSurface) {
  const c = CAPITAL_OS_BRAND.color;
  const l = CAPITAL_OS_BRAND.light;

  if (style === 'monochrome') {
    const ink = surface === 'light' ? l.textPrimary : '#FFFFFF';
    return { frame: 'none', bar: ink, base: ink };
  }

  if (style === 'light' || surface === 'light') {
    return { frame: '#ECFDF5', bar: c.primary, base: c.primaryHover };
  }

  return { frame: '#0F172A', bar: c.primaryMuted, base: c.primary };
}

/** Ledger / growth mark — Capital OS. */
export function CapitalOsMark({
  size = 32,
  style = 'filled',
  surface = 'dark',
  className,
  title = 'Capital OS',
}: CapitalOsMarkProps) {
  const colors = palette(style, surface);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${CAPITAL_OS_VIEWBOX} ${CAPITAL_OS_VIEWBOX}`}
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {colors.frame !== 'none' ? (
        <rect x="96" y="96" width="320" height="320" rx="72" fill={colors.frame} />
      ) : null}
      {CAPITAL_OS_BARS.map((b) => (
        <rect key={`${b.x}-${b.y}`} x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill={colors.bar} />
      ))}
      <line
        x1={CAPITAL_OS_BASELINE.x1}
        y1={CAPITAL_OS_BASELINE.y1}
        x2={CAPITAL_OS_BASELINE.x2}
        y2={CAPITAL_OS_BASELINE.y2}
        stroke={colors.base}
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}
