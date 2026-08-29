import {
  ADMIN_WORDMARK_FONT,
  ADMIN_WORDMARK_TOKENS,
  type AdminWordmarkProduct,
} from '@/src/lib/brand/adminWordmarkTokens';

export type AdminProductWordmarkProps = {
  product: AdminWordmarkProduct;
  /** Target visual height in px — same chrome slot as ApgOsMark `size`. */
  size?: number;
  className?: string;
  /** Accessibility label; visible text remains mark-only. */
  title?: string;
};

/**
 * Admin-only product wordmark (SOFT / AUTO / NET WORTH).
 *
 * Layout contract matches ApgOsMark: height = `size`, width = auto, no square
 * box, no baked-in rectangle, no lockup subtitle. Visible label is the product
 * name only.
 *
 * Do not import from Salon Software marketing, Platform console, or Awesome PG
 * customer surfaces — those keep their own identity.
 */
export function AdminProductWordmark({
  product,
  size = 32,
  className,
  title,
}: AdminProductWordmarkProps) {
  const token = ADMIN_WORDMARK_TOKENS[product];
  const ariaLabel = title ?? token.label;
  const fontSize = Number((size * token.fontScale).toFixed(2));

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      data-admin-wordmark={product}
      className={['inline-flex max-w-none shrink-0 select-none items-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        height: size,
        width: 'auto',
        color: token.color,
        fontFamily: ADMIN_WORDMARK_FONT,
        fontSize,
        fontWeight: 800,
        fontKerning: 'normal',
        fontSynthesis: 'none',
        letterSpacing: token.letterSpacing,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {token.label}
    </span>
  );
}
