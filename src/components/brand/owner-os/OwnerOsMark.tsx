type OwnerOsMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

/** Final Net Worth admin mark (reference PNG). Do not substitute a redesigned SVG. */
export const OWNER_OS_MARK_SRC = '/owner-os/net-worth-admin-mark.png';
export const OWNER_OS_MARK_INTRINSIC = { width: 512, height: 120 } as const;

/** NET WORTH wordmark — Owner / Net Worth admin panel logo. */
export function OwnerOsMark({
  size = 32,
  className,
  title = 'NET WORTH',
}: OwnerOsMarkProps) {
  return (
    // Native img preserves the source aspect ratio (do not force a square box).
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
