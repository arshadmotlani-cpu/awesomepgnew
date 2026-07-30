import type { BasketFlags, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { FinancialLedgerEntryDraft } from '@/src/hair/domain/ledger/types';

export function planCheckoutLedger(input: {
  customerId: string;
  grandTotalPaise: number;
  payments: PaymentEntry[];
  flags: BasketFlags;
}): FinancialLedgerEntryDraft[] {
  const entries: FinancialLedgerEntryDraft[] = [];
  const { grandTotalPaise, payments, flags } = input;

  if (grandTotalPaise <= 0) return entries;

  entries.push({
    account: 'accounts_receivable',
    direction: 'debit',
    amountPaise: grandTotalPaise,
    method: null,
    kind: 'invoice_charge',
  });

  const paySum = payments.reduce((s, p) => s + Math.max(0, p.amountPaise), 0);

  for (const p of payments) {
    if (p.amountPaise <= 0) continue;
    entries.push({
      account: p.method,
      direction: 'debit',
      amountPaise: p.amountPaise,
      method: p.method,
      kind: 'payment_received',
    });
    entries.push({
      account: 'accounts_receivable',
      direction: 'credit',
      amountPaise: p.amountPaise,
      method: p.method,
      kind: 'payment_received',
    });
  }

  const remaining = Math.max(0, grandTotalPaise - paySum);

  if (flags.markFullDue || (flags.markDue && remaining > 0)) {
    if (remaining > 0) {
      entries.push({
        account: 'accounts_receivable',
        direction: 'debit',
        amountPaise: remaining,
        method: null,
        kind: 'receivable_open',
      });
    }
  }

  if (paySum > grandTotalPaise && flags.creditOverpayAsAdvance) {
    const advanceMethods = payments.filter((p) => p.method === 'cash' || p.method === 'card');
    const advanceEligible = advanceMethods.reduce((s, p) => s + p.amountPaise, 0);
    const overpay = Math.min(paySum - grandTotalPaise, advanceEligible);
    if (overpay > 0) {
      entries.push({
        account: 'customer_wallet',
        direction: 'credit',
        amountPaise: overpay,
        method: null,
        kind: 'advance_credit',
      });
    }
  }

  return entries;
}

export function walletBalanceFromLedger(
  entries: Array<{ kind: string; direction: string; amountPaise: number }>,
): number {
  let balance = 0;
  for (const e of entries) {
    if (e.kind === 'advance_credit' && e.direction === 'credit') balance += e.amountPaise;
    if (e.kind === 'wallet_redemption' && e.direction === 'debit') balance -= e.amountPaise;
  }
  return Math.max(0, balance);
}
