import Image from 'next/image';

type AwesomePgLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Premium Awesome PG brand mark (icon asset). */
export function AwesomePgLogo({
  size = 32,
  className,
  priority = false,
  alt = 'Awesome PG',
}: AwesomePgLogoProps) {
  const src =
    size <= 32
      ? '/icons/apg-favicon-32.png'
      : size <= 64
        ? '/icons/apg-icon-64.png'
        : size <= 128
          ? '/icons/apg-icon-128.png'
          : size <= 192
            ? '/icons/apg-admin-192.png'
            : '/icons/apg-admin-512.png';

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={['rounded-lg object-cover', className].filter(Boolean).join(' ')}
    />
  );
}
