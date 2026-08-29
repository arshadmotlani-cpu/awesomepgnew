/**
 * Admin-panel product wordmarks — mark-only labels and colors.
 * Logo colors only; do not use for general product UI accents.
 *
 * Isolated from the Salon Software marketing site, Platform console,
 * and Awesome PG customer marketing. Do not import these tokens there.
 */

export const ADMIN_WORDMARK_PRODUCTS = ['soft', 'auto', 'netWorth'] as const;
export type AdminWordmarkProduct = (typeof ADMIN_WORDMARK_PRODUCTS)[number];

export const ADMIN_WORDMARK_FONT =
  'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif';

export const ADMIN_WORDMARK_TOKENS = {
  soft: {
    label: 'SOFT',
    color: '#7C3AED',
    /**
     * Cap-height as a fraction of the `size` slot (PG mark uses height: size).
     * Tuned so SOFT/AUTO read at the same visual weight as the PG letters.
     */
    fontScale: 0.78,
    letterSpacing: '-0.045em',
  },
  auto: {
    label: 'AUTO',
    color: '#22D3EE',
    fontScale: 0.78,
    letterSpacing: '-0.045em',
  },
  netWorth: {
    label: 'NET WORTH',
    color: '#2DD4BF',
    /** Slightly smaller than 4-letter marks so two words stay readable in nav. */
    fontScale: 0.66,
    letterSpacing: '0.05em',
  },
} as const satisfies Record<
  AdminWordmarkProduct,
  { label: string; color: string; fontScale: number; letterSpacing: string }
>;
