import { salonDayBounds } from '@/src/hair/lib/salonTime';

export type SalesCategoryFigures = {
  quantity: number;
  amountPaise: number;
};

export type SalesFigures = {
  service: SalesCategoryFigures;
  package: SalesCategoryFigures;
  product: SalesCategoryFigures;
  membership: SalesCategoryFigures;
  totalQuantity: number;
  totalPaise: number;
};

const EMPTY_CATEGORY = (): SalesCategoryFigures => ({ quantity: 0, amountPaise: 0 });

export function emptySalesFigures(): SalesFigures {
  return {
    service: EMPTY_CATEGORY(),
    package: EMPTY_CATEGORY(),
    product: EMPTY_CATEGORY(),
    membership: EMPTY_CATEGORY(),
    totalQuantity: 0,
    totalPaise: 0,
  };
}

type SalesLineInput = {
  invoiceId: string;
  grandTotalPaise: number;
  kind: string;
  quantity: number;
  lineTotalPaise: number;
};

function categoryKey(kind: string): keyof Pick<SalesFigures, 'service' | 'package' | 'product' | 'membership'> | null {
  if (kind === 'service' || kind === 'package' || kind === 'product' || kind === 'membership') return kind;
  return null;
}

/**
 * Category amounts are line finals scaled so each invoice's categories sum to its grand total
 * (line discounts and GST are already in the line; membership and other invoice adjustments
 * are in the grand total). Gift cards are not a category.
 */
export function foldSalesLines(rows: SalesLineInput[]): SalesFigures {
  const byInvoice = new Map<string, SalesLineInput[]>();
  for (const row of rows) {
    const list = byInvoice.get(row.invoiceId) ?? [];
    list.push(row);
    byInvoice.set(row.invoiceId, list);
  }

  const out = emptySalesFigures();
  for (const lines of byInvoice.values()) {
    const grand = Math.max(0, Number(lines[0]?.grandTotalPaise ?? 0));
    const recognized = lines.filter((line) => categoryKey(line.kind));
    const lineSum = recognized.reduce((s, line) => s + Math.max(0, Number(line.lineTotalPaise ?? 0)), 0);
    const scale = lineSum > 0 ? grand / lineSum : 0;
    for (const line of lines) {
      const key = categoryKey(line.kind);
      if (!key) continue;
      const qty = Math.max(0, Number(line.quantity ?? 0));
      const amount = Math.round(Math.max(0, Number(line.lineTotalPaise ?? 0)) * scale);
      out[key].quantity += qty;
      out[key].amountPaise += amount;
      out.totalQuantity += qty;
      out.totalPaise += amount;
    }
  }
  return out;
}

export type TenderFigures = {
  cashPaise: number;
  cardPaise: number;
  upiPaise: number;
  otherPaise: number;
  refundsPaise: number;
  totalPaise: number;
};

/** Real tenders only. Wallet and gift card are stored value, not new collection. */
export function accumulateCollectionTender(
  breakdown: TenderFigures,
  account: string | null,
  method: string | null,
  amountPaise: number,
): TenderFigures {
  const out = { ...breakdown };
  const key = (method ?? account ?? '').toLowerCase();
  if (key === 'wallet' || key === 'gift_card') return out;
  const amount = Math.max(0, Math.floor(amountPaise));
  if (key === 'cash') out.cashPaise += amount;
  else if (key === 'card') out.cardPaise += amount;
  else if (key === 'upi' || key === 'online') out.upiPaise += amount;
  else if (key) out.otherPaise += amount;
  else return out;
  out.totalPaise = out.cashPaise + out.cardPaise + out.upiPaise + out.otherPaise;
  return out;
}

export function collectionAfterRefunds(gross: TenderFigures, refundsPaise: number): TenderFigures {
  const refunds = Math.max(0, Math.floor(refundsPaise));
  return {
    ...gross,
    refundsPaise: refunds,
    totalPaise: gross.cashPaise + gross.cardPaise + gross.upiPaise + gross.otherPaise - refunds,
  };
}

export type MonthInvoiceBucket = {
  monthKey: string;
  label: string;
  invoiceCount: number;
  invoiceAmountPaise: number;
  discountPaise: number;
  averageBillPaise: number;
};

export function enumerateMonthKeys(from: Date, to: Date, timezone: string): string[] {
  if (!(to.getTime() > from.getTime())) return [];
  const startKey = salonDayBounds(timezone, from).dayKey.slice(0, 7);
  const endKey = salonDayBounds(timezone, new Date(to.getTime() - 1)).dayKey.slice(0, 7);
  const [startYear, startMonth] = startKey.split('-').map(Number);
  const [endYear, endMonth] = endKey.split('-').map(Number);
  const keys: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    if (keys.length > 240) break;
  }
  return keys;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.replace(' ', ' ');
}

export function buildMonthInvoiceRows(
  monthKeys: string[],
  invoices: Array<{ monthKey: string; grandTotalPaise: number; discountPaise: number }>,
): MonthInvoiceBucket[] {
  const buckets = new Map<string, { invoiceAmountPaise: number; discountPaise: number; invoiceCount: number }>();
  for (const key of monthKeys) {
    buckets.set(key, { invoiceAmountPaise: 0, discountPaise: 0, invoiceCount: 0 });
  }
  for (const row of invoices) {
    const bucket = buckets.get(row.monthKey);
    if (!bucket) continue;
    bucket.invoiceCount += 1;
    bucket.invoiceAmountPaise += Math.max(0, row.grandTotalPaise);
    bucket.discountPaise += Math.max(0, row.discountPaise);
  }
  return monthKeys.map((monthKey) => {
    const bucket = buckets.get(monthKey)!;
    const averageBillPaise =
      bucket.invoiceCount > 0 ? Math.round(bucket.invoiceAmountPaise / bucket.invoiceCount) : 0;
    return {
      monthKey,
      label: monthLabel(monthKey),
      invoiceCount: bucket.invoiceCount,
      invoiceAmountPaise: bucket.invoiceAmountPaise,
      discountPaise: bucket.discountPaise,
      averageBillPaise,
    };
  });
}
