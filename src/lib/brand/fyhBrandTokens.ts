/**
 * For Your Hair ERP — brand mark tokens (purple).
 * In-app UI chrome remains forest/gold in src/hair/styles/globals.css.
 */

export const FYH_ERP = {
  name: 'For Your Hair ERP',
  shortName: 'For Your Hair',
  productLine: 'Luxury Salon ERP',
  tagline: 'Luxury Salon ERP — For Your Hair',
} as const;

export const FYH_BRAND = {
  /** Mark + favicon + metadata only this sprint */
  mark: {
    primary: '#7C3AED',
    primaryHover: '#6D28D9',
    primarySoft: '#A78BFA',
    primarySubtle: 'rgba(124, 58, 237, 0.18)',
    onMark: '#F5F3FF',
  },
  assetBase: '/fyh',
} as const;
