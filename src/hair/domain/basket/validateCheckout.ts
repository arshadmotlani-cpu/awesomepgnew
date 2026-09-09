import type { Basket, BasketFlags, PricedBasket } from '@/src/hair/domain/basket/types';
import { validateStaffAllocations } from '@/src/hair/domain/basket/validate';

export function collectBasketValidationErrors(basket: Basket): string[] {
  const errors: string[] = [];
  if (!basket.customerId) errors.push('Select a customer');
  if (basket.lines.length === 0) errors.push('Add at least one item');

  for (const line of basket.lines) {
    if (line.billableRef.type === 'package') continue;

    if (line.prepaidRedemption) {
      if (line.staff.length === 0) {
        errors.push(`${line.snapshot.name}: Select staff for package redemption`);
      }
      const err = validateStaffAllocations(line);
      if (err) errors.push(err);
      continue;
    }

    const err = validateStaffAllocations(line);
    if (err) errors.push(err);
  }

  return errors;
}

export function collectPaymentValidationErrors(
  grandTotalPaise: number,
  paySum: number,
  flags: BasketFlags,
  allowUnpaid?: boolean,
): string[] {
  if (grandTotalPaise === 0) return [];
  if (allowUnpaid && paySum === 0) return [];
  if (flags.markFullDue) return [];
  if (flags.markDue && paySum > 0 && paySum < grandTotalPaise) return [];
  if (flags.markDue && paySum === 0) {
    return ['Add a payment or use Mark Full Due'];
  }
  if (paySum > grandTotalPaise && !flags.creditOverpayAsAdvance) {
    return ['Overpayment requires marking remaining as advance (Cash/Card only)'];
  }
  if (!flags.markDue && paySum < grandTotalPaise) {
    return [
      `Payment total must cover amount due (₹${(grandTotalPaise / 100).toFixed(2)}). Use Mark as Due for partial payment.`,
    ];
  }
  return [];
}

export function validateQuickSaleCheckout(basket: Basket, priced: PricedBasket): string[] {
  const paySum = basket.payments.reduce((s, p) => s + p.amountPaise, 0);
  return [
    ...collectBasketValidationErrors(basket),
    ...collectPaymentValidationErrors(priced.totals.grandTotalPaise, paySum, basket.flags),
  ];
}
