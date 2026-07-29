import { AwesomePgMark } from '@/src/components/brand/AwesomePgMark';

type AwesomePgLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Premium Awesome PG brand mark. */
export function AwesomePgLogo({
  size = 32,
  className,
  priority: _priority = false,
  alt = 'Awesome PG',
}: AwesomePgLogoProps) {
  return (
    <AwesomePgMark
      size={size}
      className={['rounded-lg shadow-md shadow-orange-500/25', className].filter(Boolean).join(' ')}
      title={alt}
    />
  );
}
