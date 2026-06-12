export type Ps4PlanId = 'weekly' | 'biweekly' | 'monthly';

export type Ps4Plan = {
  id: Ps4PlanId;
  label: string;
  /** Customer-facing description — PS4 gaming maintenance add-on, not rent. */
  description: string;
  pricePaise: number;
  durationDays: number;
};

/** PS4 gaming maintenance add-on plans (separate from bed rent / deposit). */
export const PS4_PLANS: Record<Ps4PlanId, Ps4Plan> = {
  weekly: {
    id: 'weekly',
    label: 'Weekly',
    description: 'PS4 gaming maintenance · 7 days',
    pricePaise: 35_000,
    durationDays: 7,
  },
  biweekly: {
    id: 'biweekly',
    label: 'Bi-weekly',
    description: 'PS4 gaming maintenance · 14 days',
    pricePaise: 60_000,
    durationDays: 14,
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    description: 'PS4 gaming maintenance · 30 days',
    pricePaise: 80_000,
    durationDays: 30,
  },
};

export const PS4_ADDON_LABEL = 'PS4 gaming maintenance add-on';

/** Walk-in hourly lounge rate (₹50/hr) — membership plans are better value. */
export const PS4_HOURLY_RATE_PAISE = 5_000;

export const PS4_LOUNGE_HEADLINE = 'Our only best shared gaming lounge';

export const PS4_LOUNGE_HOURLY_NOTE =
  'Also available at ₹50 per hour — pick a plan below for unlimited lounge access during your stay.';

/** Customer-facing rate card line (weekly / bi-weekly / monthly). */
export function ps4PlanRatesSummary(): string {
  const fmt = (paise: number) => `₹${Math.round(paise / 100)}`;
  return `Weekly ${fmt(PS4_PLANS.weekly.pricePaise)} · Bi-weekly ${fmt(PS4_PLANS.biweekly.pricePaise)} · Monthly ${fmt(PS4_PLANS.monthly.pricePaise)}`;
}

export function isPs4PlanId(value: string): value is Ps4PlanId {
  return value === 'weekly' || value === 'biweekly' || value === 'monthly';
}

export function planRank(plan: Ps4PlanId): number {
  if (plan === 'weekly') return 1;
  if (plan === 'biweekly') return 2;
  return 3;
}
