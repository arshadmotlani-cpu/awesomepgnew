import { CHECKOUT_COMPLETE_SUCCESS_MESSAGE } from '@/src/lib/checkout/checkoutSettlementActionTypes';

export { CHECKOUT_COMPLETE_SUCCESS_MESSAGE };

export const CHECKOUT_COMPLETE_LOADING_LABEL = 'Completing checkout...';

export function isCheckoutCompleteSuccessMessage(message: string): boolean {
  return message === CHECKOUT_COMPLETE_SUCCESS_MESSAGE;
}
