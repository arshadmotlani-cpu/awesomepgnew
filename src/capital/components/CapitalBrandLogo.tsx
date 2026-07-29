import { CapitalOsMark } from '@/src/components/brand/capital-os/CapitalOsMark';
import { cn } from '@/src/capital/lib/utils';

type CapitalBrandLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Capital OS brand mark (SVG). */
export function CapitalBrandLogo({
  size = 32,
  className,
  priority: _priority = false,
  alt = 'Capital OS',
}: CapitalBrandLogoProps) {
  return (
    <CapitalOsMark
      size={size}
      className={cn('rounded-lg object-cover shadow-lg shadow-black/30', className)}
      title={alt}
    />
  );
}
