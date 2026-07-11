import Image from 'next/image';
import { cn } from '@/src/capital/lib/utils';

type CapitalBrandLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Premium Automotive Capital brand mark (icon asset). */
export function CapitalBrandLogo({
  size = 32,
  className,
  priority = false,
  alt = 'Automotive Capital',
}: CapitalBrandLogoProps) {
  const src =
    size <= 32
      ? '/capital/icons/favicon-32.png'
      : size <= 64
        ? '/capital/icons/icon-64.png'
        : size <= 128
          ? '/capital/icons/icon-128.png'
          : size <= 192
            ? '/capital/icons/icon-192.png'
            : '/capital/icons/icon-512.png';

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={cn('rounded-lg object-cover', className)}
    />
  );
}
