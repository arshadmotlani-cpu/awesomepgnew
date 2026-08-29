import { AdminProductWordmark } from '@/src/components/brand/AdminProductWordmark';

type OwnerOsMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

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
    <AdminProductWordmark product="netWorth" size={size} className={className} title={title} />
  );
}
