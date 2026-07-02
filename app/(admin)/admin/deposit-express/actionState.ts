export type DepositExpressActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export const initialDepositExpressActionState: DepositExpressActionState = { status: 'idle' };
