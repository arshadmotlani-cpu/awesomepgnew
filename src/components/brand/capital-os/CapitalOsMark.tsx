import { AdminProductWordmark } from '@/src/components/brand/AdminProductWordmark';

export type CapitalOsIconStyle = 'filled' | 'light' | 'monochrome';
export type CapitalOsIconSurface = 'dark' | 'light';

type CapitalOsMarkProps = {
  size?: number;
  style?: CapitalOsIconStyle;
  surface?: CapitalOsIconSurface;
  className?: string;
  title?: string;
};

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
    <AdminProductWordmark product="auto" size={size} className={className} title={title} />
  );
}
