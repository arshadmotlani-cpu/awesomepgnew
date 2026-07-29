/**
 * APG OS — master brand tokens for the Awesome PG Admin Panel.
 * Customer marketing site keeps its own orange palette.
 */

export const APG_OS = {
  name: 'APG OS',
  /** Product lockup — render as one name (see ApgOsWordmark). */
  nameParts: { apg: 'APG', os: 'OS' } as const,
  subtitle: 'Admin Panel',
  tagline: 'Operate. Manage. Control.',
  /** Approved identity — docs/qa/apg-os-concepts concept 02. */
  approvedConcept: '02-sentinel-shield' as const,
} as const;

/** Semantic design tokens — use in admin shell + auth surfaces. */
export const APG_OS_BRAND = {
  color: {
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    primaryMuted: '#3B82F6',
    primarySoft: '#60A5FA',
    primarySubtle: 'rgba(37, 99, 235, 0.12)',
    /** Sentinel shield fill (concept 02). */
    shieldNavy: '#1E293B',
    shieldDeep: '#0F172A',
    bgShell: '#0B0F14',
    bgSurface: '#1A1F27',
    bgElevated: '#141820',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.12)',
    textPrimary: '#F4F6F8',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    /** Optional accent — use sparingly (login hero, highlights). */
    gradient: 'linear-gradient(145deg, #1E293B 0%, #2563EB 45%, #0B0F14 100%)',
  },
  light: {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
  },
  radius: {
    mark: '12px',
    card: '16px',
  },
  typography: {
    wordmarkTracking: '-0.03em',
    subtitleTracking: '0.2em',
    taglineTracking: '0.16em',
  },
} as const;

/** @deprecated Use APG_OS_BRAND.color — kept for imports during migration. */
export const APG_OS_LEGACY = {
  blue: APG_OS_BRAND.color.primary,
  blueBright: APG_OS_BRAND.color.primaryMuted,
  blueSoft: APG_OS_BRAND.color.primarySoft,
  blueDeep: APG_OS_BRAND.color.primaryHover,
  shellBg: APG_OS_BRAND.color.bgShell,
  panelBg: APG_OS_BRAND.color.bgSurface,
  lightBg: APG_OS_BRAND.light.bg,
  lightInk: APG_OS_BRAND.light.textPrimary,
};
