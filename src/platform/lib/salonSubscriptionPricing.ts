/**
 * Standard salon SaaS catalog pricing (Platform Engine).
 * Charge amount lives on plan.limits.amountPaise; list price is display-only.
 * Per-org custom price = dedicated plan slug `org-custom-{organizationId}` (admin UI).
 */

export const STANDARD_SALON_LIST_PRICE_PAISE = 1_500_000; // ₹15,000
export const STANDARD_SALON_PRICE_PAISE = 650_000; // ₹6,500
export const STANDARD_SALON_BILLING_INTERVAL = 'year' as const;
export const STANDARD_SALON_PRICE_LABEL = 'Limited-time price';

/** Plan slugs that use the standard annual catalog price. */
export const STANDARD_SALON_PLAN_SLUGS = ['fyhair-production', 'fyh-staging'] as const;

const ORG_CUSTOM_PLAN_PREFIX = 'org-custom-';

export function organizationCustomPlanSlug(organizationId: string): string {
  return `${ORG_CUSTOM_PLAN_PREFIX}${organizationId}`;
}

export function isOrganizationCustomPlanSlug(slug: string | null | undefined): boolean {
  return Boolean(slug?.startsWith(ORG_CUSTOM_PLAN_PREFIX));
}

export function standardSalonPlanLimits(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    amountPaise: STANDARD_SALON_PRICE_PAISE,
    listPricePaise: STANDARD_SALON_LIST_PRICE_PAISE,
    billingInterval: STANDARD_SALON_BILLING_INTERVAL,
  };
}

/** Build plan.limits for a per-org exclusive annual price (rupees → paise). */
export function customSalonAnnualPlanLimits(
  yearlyRupees: number,
  baseLimits: Record<string, unknown> = {},
): Record<string, unknown> {
  const rupees = Math.round(yearlyRupees);
  if (!Number.isFinite(rupees) || rupees < 1) {
    throw new Error('Custom yearly price must be at least ₹1.');
  }
  const amountPaise = rupees * 100;
  const { amountPaise: _a, listPricePaise: _l, billingInterval: _b, ...rest } = baseLimits;
  return {
    ...rest,
    amountPaise,
    listPricePaise: STANDARD_SALON_LIST_PRICE_PAISE,
    billingInterval: STANDARD_SALON_BILLING_INTERVAL,
    customAnnual: true,
  };
}

export function resolveListPricePaiseFromPlanLimits(
  limits: Record<string, unknown>,
): number | null {
  const raw = limits.listPricePaise ?? limits.list_price_paise ?? limits.listPrice;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      // Rupees if small enough to be INR; otherwise treat as paise
      return n >= 10_000 ? Math.round(n) : Math.round(n * 100);
    }
  }
  return null;
}

export function formatInrFromPaise(paise: number): string {
  if (!paise || paise <= 0) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
