/** Shared checkout settlement admin action state — keep out of `'use server'` files. */
export type CheckoutSettlementActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

/** Shown after Pay & complete succeeds (toast + redirect). */
export const CHECKOUT_COMPLETE_SUCCESS_MESSAGE = 'Checkout completed successfully.';
