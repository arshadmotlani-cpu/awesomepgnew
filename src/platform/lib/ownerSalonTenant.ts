/**
 * Bootstrap/migration constants for the canonical For Your Hair Platform tenant.
 * Used only in setup scripts and migrations — never for runtime authorization bypasses.
 */
export const OWNER_SALON_ORG_SLUG = 'for-your-hair' as const;

export const OWNER_SALON_PRODUCT_LABEL = 'SOFT' as const;

export const OWNER_SALON_PLAN_SLUGS = {
  production: 'fyhair-production',
  staging: 'fyh-staging',
} as const;
