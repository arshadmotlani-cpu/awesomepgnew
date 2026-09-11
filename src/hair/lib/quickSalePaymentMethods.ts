import type { PaymentMethod } from '@/src/hair/domain/basket/types';

export type QuickSalePaymentMethodOption = {
  id: PaymentMethod;
  label: string;
};

/** POS tender methods supported by Quick Sale checkout (subset of FyhPaymentMethod). */
export const QUICK_SALE_PAYMENT_METHODS: QuickSalePaymentMethodOption[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
];

const LABEL_BY_ID = new Map(QUICK_SALE_PAYMENT_METHODS.map((m) => [m.id, m.label]));

export function quickSalePaymentMethodLabel(method: PaymentMethod): string {
  return LABEL_BY_ID.get(method) ?? method;
}
