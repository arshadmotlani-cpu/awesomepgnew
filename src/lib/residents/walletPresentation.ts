import type { ConsoleLedgerEntry } from '@/src/components/customer/design-system/ConsoleLedger';

export type WalletTimelineView = {
  moneyIn: ConsoleLedgerEntry[];
  moneyOut: ConsoleLedgerEntry[];
  depositPositionPaise: number | null;
  refundStatus: { label: string; detail: string } | null;
};

/** Group ledger rows for resident wallet presentation (display only). */
export function buildWalletTimelineView(entries: ConsoleLedgerEntry[]): WalletTimelineView {
  const moneyIn = entries.filter((e) => e.direction === 'credit');
  const moneyOut = entries.filter((e) => e.direction === 'debit');

  const depositEntries = entries.filter((e) =>
    /deposit/i.test(e.typeLabel),
  );
  const latestDeposit = depositEntries.find((e) => e.runningBalancePaise != null);
  const depositPositionPaise = latestDeposit?.runningBalancePaise ?? null;

  const latestRefund = entries.find(
    (e) => e.direction === 'credit' && /refund/i.test(e.typeLabel),
  );
  let refundStatus: WalletTimelineView['refundStatus'] = null;
  if (latestRefund) {
    const paid = latestRefund.status === 'paid' || latestRefund.status === 'succeeded';
    refundStatus = {
      label: paid ? 'Refund sent' : 'Refund processing',
      detail: paid
        ? 'Your latest refund appears in money received below.'
        : 'We are processing your refund — it will show here when sent.',
    };
  }

  return { moneyIn, moneyOut, depositPositionPaise, refundStatus };
}
