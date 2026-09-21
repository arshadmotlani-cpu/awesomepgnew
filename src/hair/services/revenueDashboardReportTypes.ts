import type { FyhExpenseCategory } from '@/src/hair/lib/expenseCategories';
import type { FyhRevenueMetric } from '@/src/hair/db/schema';

export type RevenueDashboardLocationFilter = string[] | 'all';

export type RevenueDashboardReportInput = {
  from: Date;
  to: Date;
  timezone: string;
  locationIds: RevenueDashboardLocationFilter;
  comparePreviousPeriod?: boolean;
};

export type TenderBreakdown = {
  cashPaise: number;
  cardPaise: number;
  upiPaise: number;
  otherPaise: number;
  totalPaise: number;
};

export type SalesBreakdown = {
  netServicePaise: number;
  packagePaise: number;
  productPaise: number;
  membershipPaise: number;
  giftCardPaise: number;
  totalPaise: number;
};

export type NetContributionSection = {
  grossSalesPaise: number;
  directCostPaise: number;
  netCollectionContributionPaise: number;
  usesCurrentCatalogCost: true;
};

export type RedemptionSection = {
  netServicePaise: number;
  discountPaise: number;
  totalPaise: number;
};

export type InvoiceDayRow = {
  dayKey: string;
  label: string;
  invoiceAmountPaise: number;
  discountPaise: number;
  totalPaise: number;
  invoiceCount: number;
};

export type StaffPayRow = {
  staffName: string;
  advanceSalaryPaise: number | null;
  incentivePaise: number;
  salaryPaise: number;
};

export type ExpenseCategoryRow = {
  category: FyhExpenseCategory;
  label: string;
  amountPaise: number;
};

export type PeriodComparison = {
  previousFrom: Date;
  previousTo: Date;
  salesTotalDeltaPaise: number | null;
  netContributionDeltaPaise: number | null;
  actualCollectionDeltaPaise: number | null;
};

export type RevenueDashboardReport = {
  timezone: string;
  from: Date;
  to: Date;
  locationIds: RevenueDashboardLocationFilter;
  sales: SalesBreakdown;
  netContribution: NetContributionSection;
  actualCollection: TenderBreakdown;
  advances: TenderBreakdown;
  refunds: TenderBreakdown;
  tipsTotalPaise: number;
  duesCurrentOutstandingPaise: number;
  redemption: RedemptionSection;
  invoicesDayWise: InvoiceDayRow[];
  staffPay: {
    payrollMonthKey: string | null;
    payrollPeriodLabel: string | null;
    rows: StaffPayRow[];
  };
  expenses: ExpenseCategoryRow[];
  expensesTotalPaise: number;
  comparison: PeriodComparison | null;
};

export type SalesMetricRow = {
  metric: FyhRevenueMetric | 'gift_card';
  totalPaise: number;
};
