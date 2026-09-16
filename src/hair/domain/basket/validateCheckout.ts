import type { Basket, BasketFlags, PricedBasket } from '@/src/hair/domain/basket/types';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { collectBasketLineValidationErrors } from '@/src/hair/domain/basket/validate';
import {
  findLinesMissingStaffPerformer,
  staffRequiredCheckoutDetail,
  type StaffRequiredCheckoutAlert,
} from '@/src/hair/domain/basket/staffRequired';

/** @deprecated Prefer collectBasketLineValidationErrors */
export function collectBasketValidationErrors(basket: Basket): string[] {
  return collectBasketLineValidationErrors(basket);
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
      `Payment total must cover amount due (${formatInrFromPaise(grandTotalPaise)}). Use Mark as Due for partial payment.`,
    ];
  }
  return [];
}

export type QuickSaleCheckoutValidation = {
  errors: string[];
  staffAlert: StaffRequiredCheckoutAlert | null;
  staffRequiredLineIds: string[];
};

export function analyzeQuickSaleCheckoutValidation(
  basket: Basket,
  priced: PricedBasket,
): QuickSaleCheckoutValidation {
  const paySum = basket.payments.reduce((s, p) => s + p.amountPaise, 0);
  const missingStaff = findLinesMissingStaffPerformer(basket);
  const staffAlert = missingStaff.length > 0 ? staffRequiredCheckoutDetail(missingStaff) : null;
  const errors = [
    ...collectBasketLineValidationErrors(basket),
    ...collectPaymentValidationErrors(priced.totals.grandTotalPaise, paySum, basket.flags),
  ];
  return {
    errors,
    staffAlert,
    staffRequiredLineIds: missingStaff.map((l) => l.lineId),
  };
}

export function validateQuickSaleCheckout(basket: Basket, priced: PricedBasket): string[] {
  return analyzeQuickSaleCheckoutValidation(basket, priced).errors;
}
