/**
 * Capital OS — finance product brand tokens (Automotive Capital legal entity).
 */

export const CAPITAL_OS = {
  /** Product wordmark */
  name: 'Capital OS',
  /** Legal / subtitle */
  legalName: 'Automotive Capital',
  pwaShortName: 'Capital OS',
  tagline: 'Private Automotive Investment Operating System',
} as const;

export const CAPITAL_OS_BRAND = {
  color: {
    primary: '#16A34A',
    primaryHover: '#15803D',
    primaryMuted: '#22C55E',
    primarySoft: '#4ADE80',
    primarySubtle: 'rgba(22, 163, 74, 0.14)',
    shell: '#08080C',
    surface: '#14141A',
    textPrimary: '#F4F4F5',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    border: 'rgba(255, 255, 255, 0.08)',
  },
  light: {
    bg: '#F4F4F5',
    surface: '#FFFFFF',
    textPrimary: '#18181B',
    textSecondary: '#52525B',
  },
  assetBase: '/capital-os',
  /** Legacy PNG ladder (PWA / PDF) */
  pngBase: '/capital/icons',
} as const;
