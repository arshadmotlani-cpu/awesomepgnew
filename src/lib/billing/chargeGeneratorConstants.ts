export type ResidentChargeType =
  | 'additional_deposit'
  | 'rent_charge'
  | 'electricity_charge'
  | 'custom_charge';

export const CHARGE_DEFAULTS: Record<
  Exclude<ResidentChargeType, 'electricity_charge' | 'custom_charge'>,
  { title: string; description: string }
> = {
  additional_deposit: {
    title: 'Additional Security Deposit',
    description: 'Additional refundable security deposit collected from resident.',
  },
  rent_charge: {
    title: 'Rent Due',
    description: 'Additional rent payable by resident.',
  },
};
