import { APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';
import {
  APG_OS_A_PATH,
  APG_OS_A_PATH_BOLD,
  APG_OS_SHIELD_PATH,
  APG_OS_SHIELD_STROKE,
  APG_OS_VIEWBOX,
  apgOsUseBoldLetter,
} from '@/src/lib/brand/apgOsIconGeometry';

export type ApgOsIconStyle = 'primary' | 'filled' | 'outline' | 'monochrome';
export type ApgOsIconSurface = 'dark' | 'light' | 'transparent';

type ApgOsMarkProps = {
  size?: number;
  style?: ApgOsIconStyle;
  surface?: ApgOsIconSurface;
  className?: string;
  title?: string;
};

/** @deprecated Use style + surface */
export type ApgOsMarkVariant = 'on-dark' | 'on-light' | 'mono-white' | 'mono-dark';

export function apgOsMarkVariantToProps(variant: ApgOsMarkVariant): {
  style: ApgOsIconStyle;
  surface: ApgOsIconSurface;
} {
  switch (variant) {
    case 'on-light':
      return { style: 'primary', surface: 'light' };
    case 'mono-white':
      return { style: 'monochrome', surface: 'dark' };
    case 'mono-dark':
      return { style: 'monochrome', surface: 'light' };
    case 'on-dark':
    default:
      return { style: 'primary', surface: 'dark' };
  }
}

function palette(style: ApgOsIconStyle, surface: ApgOsIconSurface) {
  const c = APG_OS_BRAND.color;
  const onLight = surface === 'light';

  if (style === 'monochrome') {
    const ink =
      surface === 'light'
        ? APG_OS_BRAND.light.textPrimary
        : surface === 'dark'
          ? '#FFFFFF'
          : APG_OS_BRAND.color.textPrimary;
    return { shieldFill: 'none', shieldStroke: ink, letterFill: ink };
  }

  if (style === 'filled') {
    return {
      shieldFill: c.shieldNavy,
      shieldStroke: c.primaryMuted,
      letterFill: '#FFFFFF',
    };
  }

  if (style === 'outline') {
    return {
      shieldFill: 'none',
      shieldStroke: onLight ? c.primary : c.primarySoft,
      letterFill: onLight ? c.primary : c.primaryMuted,
    };
  }

  return {
    shieldFill: onLight ? 'none' : 'rgba(30, 41, 59, 0.85)',
    shieldStroke: onLight ? c.primary : c.primarySoft,
    letterFill: onLight ? c.primary : c.primaryMuted,
  };
}

/** Icon-only APG OS mark — Sentinel shield + “A”. */
export function ApgOsMark({
  size = 32,
  style: iconStyle = 'primary',
  surface = 'dark',
  className,
  title = 'APG OS',
}: ApgOsMarkProps) {
  const effectiveStyle =
    apgOsUseBoldLetter(size) && iconStyle === 'primary' ? 'filled' : iconStyle;
  const colors = palette(effectiveStyle, surface);
  const letterPath = apgOsUseBoldLetter(size) ? APG_OS_A_PATH_BOLD : APG_OS_A_PATH;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${APG_OS_VIEWBOX} ${APG_OS_VIEWBOX}`}
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <path
        d={APG_OS_SHIELD_PATH}
        fill={colors.shieldFill}
        stroke={colors.shieldStroke}
        strokeWidth={APG_OS_SHIELD_STROKE}
        strokeLinejoin="round"
      />
      <path d={letterPath} fill={colors.letterFill} fillRule="evenodd" />
    </svg>
  );
}
