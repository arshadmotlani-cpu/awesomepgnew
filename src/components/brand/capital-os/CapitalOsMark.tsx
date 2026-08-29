import { ADMIN_MARK_INTRINSIC } from '@/src/lib/brand/adminMarkIntrinsic';

export type CapitalOsIconStyle = 'filled' | 'light' | 'monochrome';
export type CapitalOsIconSurface = 'dark' | 'light';

type CapitalOsMarkProps = {
  size?: number;
  style?: CapitalOsIconStyle;
  surface?: CapitalOsIconSurface;
  className?: string;
  title?: string;
};

/** Transparent AUTO admin wordmark PNG — Automotive Capital admin chrome only. */
export const CAPITAL_OS_MARK_SRC = '/capital-os/auto-admin-mark.png';
export const CAPITAL_OS_MARK_INTRINSIC = ADMIN_MARK_INTRINSIC.auto;

/**
 * AUTO admin wordmark — Automotive Capital admin chrome only.
 * Isolated from Platform and Salon Software marketing.
 */
export function CapitalOsMark({
  size = 32,
  className,
  title = 'AUTO',
}: CapitalOsMarkProps) {
  return (
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
