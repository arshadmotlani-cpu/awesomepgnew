import { CapitalOsMark } from '@/src/components/brand/capital-os/CapitalOsMark';
import { cn } from '@/src/capital/lib/utils';

type CapitalBrandLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Automotive Capital AUTO wordmark. */
export function CapitalBrandLogo({
  size = 32,
  className,
  priority: _priority = false,
  alt = 'AUTO',
}: CapitalBrandLogoProps) {
  return (
    <CapitalOsMark
      size={size}
      className={cn(className)}
      title={alt}
    />
  );
}
