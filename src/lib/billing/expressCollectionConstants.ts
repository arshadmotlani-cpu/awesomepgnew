export const EXPRESS_COLLECTION_NOTE_PREFIX = 'Express Collection — historical payment';

export type ExpressCollectionChargeType =
  | 'rent'
  | 'deposit'
  | 'electricity'
  | 'ps4'
  | 'custom';

export type ExpressCollectionPaymentMethod =
  | 'cash'
  | 'upi'
  | 'bank_transfer'
  | 'razorpay'
  | 'other';

export const EXPRESS_COLLECTION_CHARGE_TYPES: Array<{
  value: ExpressCollectionChargeType;
  label: string;
}> = [
  { value: 'rent', label: 'Rent' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'ps4', label: 'PS4' },
  { value: 'custom', label: 'Custom' },
];

export const EXPRESS_COLLECTION_PAYMENT_METHODS: Array<{
  value: ExpressCollectionPaymentMethod;
  label: string;
}> = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'other', label: 'Other' },
];

export function expressCollectionProvider(
  method: ExpressCollectionPaymentMethod,
): 'cash' | 'upi_manual' | 'bank_transfer' | 'razorpay' {
  switch (method) {
    case 'cash':
      return 'cash';
    case 'upi':
    case 'other':
      return 'upi_manual';
    case 'bank_transfer':
      return 'bank_transfer';
    case 'razorpay':
      return 'razorpay';
  }
}

export function isExpressCollectionNote(notes: string | null | undefined): boolean {
  return Boolean(notes?.includes('Express Collection'));
}
