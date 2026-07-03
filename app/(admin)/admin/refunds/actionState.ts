export type RefundActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export const initialRefundActionState: RefundActionState = { status: 'idle' };
