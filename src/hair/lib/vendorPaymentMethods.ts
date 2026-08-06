export const FYH_VENDOR_PAYMENT_METHODS = ['cash', 'bank', 'upi', 'cheque'] as const;
export type FyhVendorPaymentMethod = (typeof FYH_VENDOR_PAYMENT_METHODS)[number];

export const FYH_VENDOR_PAYMENT_METHOD_LABELS: Record<FyhVendorPaymentMethod, string> = {
  cash: 'Cash',
  bank: 'Bank',
  upi: 'UPI',
  cheque: 'Cheque',
};

export function parseVendorPaymentMethod(raw: string): FyhVendorPaymentMethod {
  if (
    raw === 'bank' ||
    raw === 'upi' ||
    raw === 'cheque'
  ) {
    return raw;
  }
  return 'cash';
}
