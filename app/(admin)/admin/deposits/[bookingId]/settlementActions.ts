'use server';

export type DepositSettlementState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

/** Legacy deposit settlement UI removed — Refund Console is the only payout path. */
export async function processDepositSettlementAction(
  _prev: DepositSettlementState,
  formData: FormData,
): Promise<DepositSettlementState> {
  const bookingId = String(formData.get('bookingId') ?? '').trim();
  return {
    status: 'error',
    message: bookingId
      ? `Legacy deposit settlement is disabled. Use Refund of Deposit: /admin/refunds?booking=${bookingId}`
      : 'Legacy deposit settlement is disabled. Use Refund of Deposit (/admin/refunds).',
  };
}
