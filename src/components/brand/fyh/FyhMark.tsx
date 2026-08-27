export type FyhIconStyle = 'filled' | 'light' | 'monochrome';
export type FyhIconSurface = 'dark' | 'light';

type FyhMarkProps = {
  size?: number;
  style?: FyhIconStyle;
  surface?: FyhIconSurface;
  className?: string;
  title?: string;
};

/** Final Salon Software admin mark (reference PNG). Do not substitute a redesigned SVG. */
export const FYH_MARK_SRC = '/fyh/soft-admin-mark.png';
export const FYH_MARK_INTRINSIC = { width: 512, height: 152 } as const;

/** SOFT wordmark — Salon Software admin panel logo. */
export function FyhMark({
  size = 32,
  className,
  title = 'SOFT',
}: FyhMarkProps) {
  return (
    // Native img preserves the source aspect ratio (do not force a square box).
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
