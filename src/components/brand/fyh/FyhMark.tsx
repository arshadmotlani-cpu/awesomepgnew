import { AdminProductWordmark } from '@/src/components/brand/AdminProductWordmark';

export type FyhIconStyle = 'filled' | 'light' | 'monochrome';
export type FyhIconSurface = 'dark' | 'light';

type FyhMarkProps = {
  size?: number;
  style?: FyhIconStyle;
  surface?: FyhIconSurface;
  className?: string;
  title?: string;
};

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
    <AdminProductWordmark product="soft" size={size} className={className} title={title} />
  );
}
