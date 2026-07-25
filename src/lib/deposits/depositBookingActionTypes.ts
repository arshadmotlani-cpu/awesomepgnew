/** Shared deposit booking admin action state — keep out of `'use server'` files. */
export type DepositBookingActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export const depositBookingInitialActionState: DepositBookingActionState = { status: 'idle' };

export type DepositSettlementState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };
