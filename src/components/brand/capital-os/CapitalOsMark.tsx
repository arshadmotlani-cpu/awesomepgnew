export type CapitalOsIconStyle = 'filled' | 'light' | 'monochrome';
export type CapitalOsIconSurface = 'dark' | 'light';

type CapitalOsMarkProps = {
  size?: number;
  style?: CapitalOsIconStyle;
  surface?: CapitalOsIconSurface;
  className?: string;
  title?: string;
};

/** Final Automotive Capital admin mark (reference PNG). Do not substitute a redesigned SVG. */
export const CAPITAL_OS_MARK_SRC = '/capital-os/auto-admin-mark.png';
export const CAPITAL_OS_MARK_INTRINSIC = { width: 512, height: 328 } as const;

/** AUTO wordmark — Automotive Capital admin panel logo. */
export function CapitalOsMark({
  size = 32,
  className,
  title = 'AUTO',
}: CapitalOsMarkProps) {
  return (
    // Native img preserves the source aspect ratio (do not force a square box).
    // eslint-disable-next-line @next/next/no-img-element -- static public brand asset; must not crop/stretch
    <img
      src={CAPITAL_OS_MARK_SRC}
      alt={title}
      width={CAPITAL_OS_MARK_INTRINSIC.width}
      height={CAPITAL_OS_MARK_INTRINSIC.height}
      draggable={false}
      className={['block max-w-none shrink-0 object-contain object-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{ height: size, width: 'auto' }}
    />
  );
}
