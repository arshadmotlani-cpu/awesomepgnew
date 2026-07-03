export type RefundActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; receiptSettlementId?: string }
  | { status: 'error'; message: string };

export const initialRefundActionState: RefundActionState = { status: 'idle' };
