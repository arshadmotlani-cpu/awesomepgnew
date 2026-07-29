/**
 * Awesome PG family — shared spacing, shells, and naming patterns.
 */

export const AWESOME_PG_FAMILY = {
  companyName: 'Awesome PG',
  shellBgDark: '#0B0F14',
  shellBgCustomer: '#070A0F',
  radiusMark: '12px',
  radiusCard: '16px',
  sidebarHeightPx: 64,
  microLabelClass: 'text-[11px] font-medium uppercase tracking-[0.2em]',
} as const;

export type FamilyProductId = 'awesomepg' | 'apgos' | 'capital' | 'fyhair';

export const FAMILY_PRODUCTS: Record<
  FamilyProductId,
  { slug: string; previewPath: string; titleTemplate: string }
> = {
  awesomepg: {
    slug: 'awesome-pg',
    previewPath: '/brand/awesomepg',
    titleTemplate: '%s · Awesome PG',
  },
  apgos: {
    slug: 'admin-os',
    previewPath: '/brand/apgos',
    titleTemplate: '%s · APG OS',
  },
  capital: {
    slug: 'capital-os',
    previewPath: '/brand/capital',
    titleTemplate: '%s · Capital OS',
  },
  fyhair: {
    slug: 'fyh',
    previewPath: '/brand/fyhair',
    titleTemplate: '%s · For Your Hair ERP',
  },
};
