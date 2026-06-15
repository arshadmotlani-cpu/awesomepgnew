/** Single source of truth — resident financial summary types. */

export type FinancialItemKind =
  | 'rent'
  | 'deposit'
  | 'electricity'
  | 'ps4'
  | 'custom'
  | 'late_fee'
  | 'adjustment'
  | 'other';

export type ResidentFinancialLineItem = {
  id: string;
  kind: FinancialItemKind;
  label: string;
  invoiceNumber?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  financialInvoiceId?: string | null;
  requiredPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  dueDate?: string | null;
  generatedAt?: string | null;
  status: string;
  pgId?: string | null;
  pgName?: string | null;
  roomNumber?: string | null;
};

export type ResidentFinancialCategory = {
  requiredPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  items: ResidentFinancialLineItem[];
};

export type ResidentDepositCategory = ResidentFinancialCategory & {
  refundablePaise: number;
};

export type ResidentFinancialTotals = {
  requiredPaise: number;
  paidPaise: number;
  outstandingPaise: number;
};

export type ResidentFinancialSummary = {
  customerId: string;
  bookingId: string | null;
  bookingCode: string | null;
  customerName: string;
  customerPhone: string;
  pgId: string | null;
  pgName: string | null;
  roomNumber: string | null;
  asOf: string;
  rent: ResidentFinancialCategory;
  deposit: ResidentDepositCategory;
  electricity: ResidentFinancialCategory;
  other: ResidentFinancialCategory;
  totals: ResidentFinancialTotals;
};

export type GlobalFinancialAggregates = {
  asOf: string;
  rent: ResidentFinancialTotals;
  deposit: ResidentFinancialTotals;
  electricity: ResidentFinancialTotals;
  other: ResidentFinancialTotals;
  totals: ResidentFinancialTotals;
  /** Counts for dashboard cards */
  pendingRentInvoiceCount: number;
  pendingElectricityInvoiceCount: number;
};
