import type { BasketFlags, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { FinancialLedgerEntryDraft } from '@/src/hair/domain/ledger/types';

type TenderPayment = { method: PaymentEntry['method']; amountPaise: number };

/** Remaining receivable when checkout explicitly marks the unpaid portion as due. */
export function remainingReceivablePaise(grandTotalPaise: number, paySum: number): number {
  return Math.max(0, grandTotalPaise - Math.max(0, paySum));
}

function checkoutOpensReceivable(flags: BasketFlags, remainingPaise: number): boolean {
  if (remainingPaise <= 0) return false;
  return Boolean(flags.markFullDue || flags.markDue);
}

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
  const remaining = remainingReceivablePaise(grandTotalPaise, paySum);
  const opensReceivable = checkoutOpensReceivable(flags, remaining);

  for (const p of payments) {
    if (p.amountPaise <= 0) continue;
    if (p.method === 'wallet') {
      entries.push({
        account: 'customer_wallet',
        direction: 'debit',
        amountPaise: p.amountPaise,
        method: null,
        kind: 'wallet_redemption',
      });
      if (!opensReceivable) {
        entries.push({
          account: 'accounts_receivable',
          direction: 'credit',
          amountPaise: p.amountPaise,
          method: null,
          kind: 'payment_received',
        });
      }
      continue;
    }
    entries.push({
      account: p.method,
      direction: 'debit',
      amountPaise: p.amountPaise,
      method: p.method,
      kind: 'payment_received',
    });
    if (!opensReceivable) {
      entries.push({
        account: 'accounts_receivable',
        direction: 'credit',
        amountPaise: p.amountPaise,
        method: p.method,
        kind: 'payment_received',
      });
    }
  }

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

/** Ledger for collecting against an existing invoice due (no new sale / invoice_charge). */
export function planInvoiceSettlementLedger(payments: TenderPayment[]): FinancialLedgerEntryDraft[] {
  const entries: FinancialLedgerEntryDraft[] = [];
  for (const p of payments) {
    if (p.amountPaise <= 0) continue;
    if (p.method === 'wallet') {
      entries.push({
        account: 'customer_wallet',
        direction: 'debit',
        amountPaise: p.amountPaise,
        method: null,
        kind: 'wallet_redemption',
      });
      entries.push({
        account: 'accounts_receivable',
        direction: 'credit',
        amountPaise: p.amountPaise,
        method: null,
        kind: 'receivable_settled',
      });
      continue;
    }
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
      kind: 'receivable_settled',
    });
  }
  return entries;
}

/** Matches receivablesReport balance for a single checkout/settlement plan. */
export function openReceivableBalanceFromLedger(
  entries: FinancialLedgerEntryDraft[],
): number {
  let open = 0;
  let settled = 0;
  for (const e of entries) {
    if (
      e.account === 'accounts_receivable' &&
      e.kind === 'receivable_open' &&
      e.direction === 'debit'
    ) {
      open += e.amountPaise;
    }
    if (
      e.account === 'accounts_receivable' &&
      e.direction === 'credit' &&
      (e.kind === 'payment_received' || e.kind === 'receivable_settled')
    ) {
      settled += e.amountPaise;
    }
  }
  return Math.max(0, open - settled);
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
