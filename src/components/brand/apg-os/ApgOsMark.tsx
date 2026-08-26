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

/** Final PG admin-panel mark (reference PNG). Do not substitute a redesigned SVG. */
export const APG_OS_MARK_SRC = '/admin-os/pg-admin-mark.png';
export const APG_OS_MARK_INTRINSIC = { width: 512, height: 462 } as const;

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

/** Icon-only PG admin-panel mark — interlocking PG on charcoal rounded square. */
export function ApgOsMark({
  size = 32,
  className,
  title = 'PG',
}: ApgOsMarkProps) {
  return (
    // Native img preserves the source aspect ratio (do not force a square box).
    // eslint-disable-next-line @next/next/no-img-element -- static public brand asset; must not crop/stretch
    <img
      src={APG_OS_MARK_SRC}
      alt={title}
      width={APG_OS_MARK_INTRINSIC.width}
      height={APG_OS_MARK_INTRINSIC.height}
      draggable={false}
      className={['block max-w-none shrink-0 object-contain object-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{ height: size, width: 'auto' }}
    />
  );
}
