export type PricingLineKind =
  | 'monthly_cycle'
  | 'weekly_cycle'
  | 'daily_nights'
  | 'pro_rata_days'
  | 'deposit';

export type PricingLineItem = {
  kind: PricingLineKind;
  description: string;
  units: number;
  unitPricePaise: number;
  amountPaise: number;
};

export type FixedStayPricingStrategy =
  | 'weeks_plus_days'
  | 'pure_daily'
  | 'weekly_ceil'
  | 'monthly_pro_rata';
