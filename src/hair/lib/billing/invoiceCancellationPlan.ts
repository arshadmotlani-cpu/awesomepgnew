import type { FinancialLedgerEntryDraft } from '@/src/hair/domain/ledger/types';

export type InvoiceLedgerRow = {
  kind: string;
  direction: string;
  account: string;
  amountPaise: number;
};

/** Open receivable still sitting on this invoice's ledger rows. */
export function openReceivableOnInvoiceLedger(entries: InvoiceLedgerRow[]): number {
  let open = 0;
  let settled = 0;
  for (const entry of entries) {
    const amount = Math.max(0, Math.floor(entry.amountPaise));
    if (
      entry.account === 'accounts_receivable' &&
      entry.kind === 'receivable_open' &&
      entry.direction === 'debit'
    ) {
      open += amount;
    }
    if (
      entry.account === 'accounts_receivable' &&
      entry.direction === 'credit' &&
      (entry.kind === 'payment_received' || entry.kind === 'receivable_settled')
    ) {
      settled += amount;
    }
  }
  return Math.max(0, open - settled);
}

export function walletRedeemedOnInvoiceLedger(entries: InvoiceLedgerRow[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.kind === 'wallet_redemption' && entry.direction === 'debit') {
      return sum + Math.max(0, Math.floor(entry.amountPaise));
    }
    return sum;
  }, 0);
}

/**
 * Offsets posted when an issued invoice is cancelled.
 * Original payment and charge rows stay. These entries close the remaining due
 * and put used customer credit back on the wallet.
 */
export function planInvoiceCancellationLedger(input: {
  openReceivablePaise: number;
  walletRedeemedPaise: number;
}): FinancialLedgerEntryDraft[] {
  const entries: FinancialLedgerEntryDraft[] = [];
  const openReceivablePaise = Math.max(0, Math.floor(input.openReceivablePaise));
  const walletRedeemedPaise = Math.max(0, Math.floor(input.walletRedeemedPaise));

  if (openReceivablePaise > 0) {
    entries.push({
      account: 'accounts_receivable',
      direction: 'credit',
      amountPaise: openReceivablePaise,
      method: null,
      kind: 'receivable_settled',
      reference: 'invoice-cancel',
    });
  }

  if (walletRedeemedPaise > 0) {
    entries.push({
      account: 'customer_wallet',
      direction: 'credit',
      amountPaise: walletRedeemedPaise,
      method: null,
      kind: 'advance_credit',
      reference: 'invoice-cancel',
    });
  }

  return entries;
}

export function appendCancellationAudit(
  existing: string | null | undefined,
  input: { at: Date; actor: string; reason: string },
): string {
  const reason = input.reason.trim();
  const actor = input.actor.trim() || 'operator';
  const line = `[cancelled ${input.at.toISOString()} by ${actor}] ${reason}`;
  const prev = existing?.trim();
  return prev ? `${prev}\n${line}` : line;
}

export function invoiceCanBeCancelled(status: string): boolean {
  return status !== 'void' && status !== 'refunded';
}
