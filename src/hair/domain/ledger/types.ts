export type LedgerAccount =
  | 'customer_wallet'
  | 'accounts_receivable'
  | 'cash'
  | 'upi'
  | 'card';

export type LedgerKind =
  | 'invoice_charge'
  | 'payment_received'
  | 'advance_credit'
  | 'wallet_redemption'
  | 'receivable_open'
  | 'receivable_settled';

export type FinancialLedgerEntryDraft = {
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  amountPaise: number;
  method: 'cash' | 'upi' | 'card' | null;
  kind: LedgerKind;
  reference?: string | null;
};

export type PersistedLedgerEntry = FinancialLedgerEntryDraft & {
  id: string;
  customerId: string;
  invoiceId: string | null;
  createdAt: Date;
};
