import type { BillableItemType, StaffMode } from '@/src/hair/domain/catalog/types';
import type { FinancialLedgerEntryDraft } from '@/src/hair/domain/ledger/types';

export type StaffAllocation = {
  staffId: string;
  shareBps: number;
};

export type BasketLineSnapshot = {
  name: string;
  code: string | null;
  unitSellingPricePaise: number;
  gstBps: number;
  staffMode: StaffMode;
  category: string | null;
};

export type BasketLine = {
  lineId: string;
  billableRef: { id: string; type: BillableItemType };
  snapshot: BasketLineSnapshot;
  quantity: number;
  overridePricePaise: number | null;
  staff: StaffAllocation[];
};

export type PaymentMethod = 'cash' | 'upi' | 'card';

export type PaymentEntry = {
  id: string;
  method: PaymentMethod;
  amountPaise: number;
};

export type BasketFlags = {
  markDue?: boolean;
  markFullDue?: boolean;
  creditOverpayAsAdvance?: boolean;
};

export type Basket = {
  customerId: string;
  lines: BasketLine[];
  payments: PaymentEntry[];
  flags: BasketFlags;
  membershipDiscountPaise?: number;
};

export type PricedLine = {
  lineId: string;
  billableRef: BasketLine['billableRef'];
  snapshot: BasketLineSnapshot;
  quantity: number;
  catalogGrossPaise: number;
  finalLinePaise: number;
  discountPaise: number;
  discountBps: number;
  basePaise: number;
  gstPaise: number;
  staff: StaffAllocation[];
  /** FK ids for persistence */
  serviceId: string | null;
  productId: string | null;
  packageId: string | null;
  membershipId: string | null;
  primaryStaffId: string | null;
};

export type AttributionRow = {
  lineId: string;
  staffId: string;
  role: 'serviced_by' | 'sold_by';
  shareBps: number;
  attributedBasePaise: number;
  revenueMetric: 'service' | 'product' | 'package' | 'membership';
};

export type PricedBasketTotals = {
  subtotalBasePaise: number;
  taxPaise: number;
  lineDiscountPaise: number;
  membershipDiscountPaise: number;
  grandTotalPaise: number;
};

export type PricedBasket = {
  customerId: string;
  lines: PricedLine[];
  totals: PricedBasketTotals;
  attributions: AttributionRow[];
  ledgerPlan: FinancialLedgerEntryDraft[];
  flags: BasketFlags;
};
