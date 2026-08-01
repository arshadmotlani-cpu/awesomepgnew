import { titleCase } from '@/src/lib/format';

/** Resident- and admin-friendly payment mode labels. */
export function formatPaymentModeLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  if (provider === 'cash') return 'Cash';
  if (provider === 'upi_manual' || provider === 'razorpay' || provider === 'stripe') return 'UPI';
  if (provider === 'bank_transfer') return 'Bank transfer';
  if (provider === 'mock') return 'Other';
  return titleCase(provider.replace(/_/g, ' '));
}
