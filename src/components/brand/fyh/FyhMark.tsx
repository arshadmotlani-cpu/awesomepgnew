import { ADMIN_MARK_INTRINSIC } from '@/src/lib/brand/adminMarkIntrinsic';

export type FyhIconStyle = 'filled' | 'light' | 'monochrome';
export type FyhIconSurface = 'dark' | 'light';

type FyhMarkProps = {
  size?: number;
  style?: FyhIconStyle;
  surface?: FyhIconSurface;
  className?: string;
  title?: string;
};

/** Transparent SOFT admin wordmark PNG — Salon Software admin chrome only. */
export const FYH_MARK_SRC = '/fyh/soft-admin-mark.png';
export const FYH_MARK_INTRINSIC = ADMIN_MARK_INTRINSIC.soft;

/**
 * SOFT admin wordmark — Salon Software admin chrome only.
 * Not used by the Salon Software marketing site (`/salon-software`).
 */
export function FyhMark({
  size = 32,
  className,
  title = 'SOFT',
}: FyhMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static public brand asset; must not crop/stretch
    <img
      src={FYH_MARK_SRC}
      alt={title}
      width={FYH_MARK_INTRINSIC.width}
      height={FYH_MARK_INTRINSIC.height}
      draggable={false}
      className={['block max-w-none shrink-0 object-contain object-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{ height: size, width: 'auto' }}
    />
  );
}
