import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';

const TERMINAL_CHECKOUT_STATUSES = new Set(['completed', 'refund_paid', 'archived']);

export type RefundConsoleActionSignals = {
  remainingDepositPaise: number;
  adminDepositRefundStatus: string | null;
  checkoutStatus: string | null;
  checkoutFinalRefundPaise: number | null;
};

/** Whether a booking belongs in the default Refund of Deposit operational queue. */
export function isRefundConsoleActionable(signals: RefundConsoleActionSignals): boolean {
  if (signals.remainingDepositPaise > 0) return true;
  if (signals.adminDepositRefundStatus === 'pending') return true;

  const checkoutStatus = signals.checkoutStatus;
  if (!checkoutStatus || TERMINAL_CHECKOUT_STATUSES.has(checkoutStatus)) {
    return false;
  }

  if (
    isStaleZeroRefundSettlement({
      status: checkoutStatus,
      finalRefundPaise: signals.checkoutFinalRefundPaise,
    })
  ) {
    return false;
  }

  return true;
}

export function partitionRefundConsoleBookings<T extends { isActionable: boolean }>(
  rows: T[],
): { actionable: T[]; historical: T[] } {
  const actionable: T[] = [];
  const historical: T[] = [];
  for (const row of rows) {
    if (row.isActionable) actionable.push(row);
    else historical.push(row);
  }
  return { actionable, historical };
}
