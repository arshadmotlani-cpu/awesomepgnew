import { ADMIN_MARK_INTRINSIC } from '@/src/lib/brand/adminMarkIntrinsic';

type OwnerOsMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

/** Transparent NET WORTH admin wordmark PNG — Net Worth admin chrome only. */
export const OWNER_OS_MARK_SRC = '/owner-os/net-worth-admin-mark.png';
export const OWNER_OS_MARK_INTRINSIC = ADMIN_MARK_INTRINSIC.netWorth;

/**
 * NET WORTH admin wordmark — Net Worth admin chrome only.
 * Isolated from Platform, Salon Software marketing, and PG customer marketing.
 */
export function OwnerOsMark({
  size = 32,
  className,
  title = 'NET WORTH',
}: OwnerOsMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static public brand asset; must not crop/stretch
    <img
      src={OWNER_OS_MARK_SRC}
      alt={title}
      width={OWNER_OS_MARK_INTRINSIC.width}
      height={OWNER_OS_MARK_INTRINSIC.height}
      draggable={false}
      className={['block max-w-none shrink-0 object-contain object-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{ height: size, width: 'auto' }}
    />
  );
}
