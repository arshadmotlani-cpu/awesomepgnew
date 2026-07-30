import { createHash } from 'node:crypto';
import type { FyhPaymentMethod } from '@/src/hair/db/schema';
import { priceLineFromParts } from '@/src/hair/domain/basket/gstInclusiveMath';
import { planCheckoutLedger } from '@/src/hair/domain/ledger/plan';

export const HISTORICAL_IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  row_id: ['row_id', 'row id', 'id'],
  transaction_date: ['transaction_date', 'transaction date', 'date', 'invoice date'],
  customer_name: ['customer_name', 'customer name', 'name', 'client', 'client name', 'client_name'],
  customer_phone: [
    'customer_phone',
    'customer phone',
    'phone',
    'mobile',
    'mobile no',
    'mobile_no',
    'mobile number',
    'mobile_number',
  ],
  description: ['description', 'item', 'service', 'line description'],
  amount_inr: ['amount_inr', 'amount inr', 'amount', 'total', 'grand total', 'amount_₹', 'amount_(₹)'],
  payment_method: ['payment_method', 'payment method', 'method', 'mode', 'type'],
  gst_percent: ['gst_percent', 'gst percent', 'gst %', 'gst'],
  discount_inr: ['discount_inr', 'discount inr', 'discount'],
  original_invoice_ref: [
    'original_invoice_ref',
    'original invoice ref',
    'original ref',
    'legacy invoice',
  ],
  quantity: ['quantity', 'qty'],
};

export type HistoricalLineItem = {
  description: string;
  serviceId?: string;
  kind: 'service' | 'custom';
};

export type HistoricalSalesRow = {
  rowNumber: number;
  rowId?: string;
  sheetName?: string;
  transactionDate: Date;
  customerName: string;
  customerPhone?: string;
  description: string;
  lineItems: HistoricalLineItem[];
  amountPaise: number;
  discountPaise: number;
  paymentMethod: FyhPaymentMethod;
  gstBps: number;
  quantity: number;
  originalInvoiceRef?: string;
};

export type PricedHistoricalLine = ReturnType<typeof priceLineFromParts> & {
  gstBps: number;
  quantity: number;
  description: string;
  serviceId?: string;
  kind: 'service' | 'custom';
};

export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[₹()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function mapHeaderToField(header: string): string | null {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HISTORICAL_IMPORT_COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  if (normalized.startsWith('amount')) return 'amount_inr';
  return null;
}

export function parsePaymentMethod(raw: string): FyhPaymentMethod | null {
  const v = raw.trim().toLowerCase();
  if (v === 'cash') return 'cash';
  if (v === 'upi') return 'upi';
  if (v === 'card' || v === 'credit' || v === 'debit') return 'card';
  if (v === 'bank' || v === 'bank transfer') return 'bank';
  return null;
}

export function parseInrToPaise(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,₹]/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'number' && value > 0) {
    const utcDays = Math.floor(value - 25569);
    return new Date(utcDays * 86400 * 1000);
  }
  const s = String(value ?? '').trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[-/](\w{3})[-/](\d{2,4})$/i);
  if (dmy) {
    const day = Number(dmy[1]);
    const mon = MONTH_MAP[dmy[2]!.slice(0, 3).toLowerCase()];
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (mon == null || !Number.isFinite(day)) return null;
    return new Date(Date.UTC(year, mon, day, 12, 0, 0));
  }

  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = iso ? new Date(`${s}T12:00:00.000Z`) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function computeImportRowKey(row: Omit<HistoricalSalesRow, 'rowNumber'>): string {
  if (row.rowId?.trim()) return row.rowId.trim();
  const payload = [
    row.sheetName ?? '',
    row.transactionDate.toISOString().slice(0, 10),
    row.customerPhone ?? row.customerName,
    String(row.amountPaise),
    row.description,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/** Split total paise across n lines; remainder distributed to first lines. */
export function distributePaise(totalPaise: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalPaise / count);
  let remainder = totalPaise - base * count;
  return Array.from({ length: count }, () => {
    if (remainder > 0) {
      remainder -= 1;
      return base + 1;
    }
    return base;
  });
}

export function priceHistoricalLine(input: {
  description: string;
  amountPaise: number;
  discountPaise: number;
  gstBps: number;
  quantity: number;
  serviceId?: string;
  kind?: 'service' | 'custom';
}): PricedHistoricalLine {
  const qty = Math.max(1, input.quantity);
  const catalogGrossPaise = input.amountPaise + Math.max(0, input.discountPaise);
  const unitSellingPricePaise = Math.round(catalogGrossPaise / qty);
  const priced = priceLineFromParts({
    unitSellingPricePaise,
    quantity: qty,
    gstBps: input.gstBps,
    overridePricePaise: input.amountPaise,
  });
  return {
    ...priced,
    gstBps: input.gstBps,
    quantity: qty,
    description: input.description.trim(),
    serviceId: input.serviceId,
    kind: input.kind ?? (input.serviceId ? 'service' : 'custom'),
  };
}

export function priceHistoricalInvoice(row: HistoricalSalesRow): {
  lines: PricedHistoricalLine[];
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  grandTotalPaise: number;
} {
  const items = row.lineItems.length
    ? row.lineItems
    : [{ description: row.description, kind: 'custom' as const }];
  const shares = distributePaise(row.amountPaise, items.length);
  const lines = items.map((item, i) =>
    priceHistoricalLine({
      description: item.description,
      amountPaise: shares[i] ?? 0,
      discountPaise: 0,
      gstBps: row.gstBps,
      quantity: 1,
      serviceId: item.serviceId,
      kind: item.kind,
    }),
  );
  const grandTotalPaise = lines.reduce((s, l) => s + l.finalLinePaise, 0);
  const subtotalPaise = lines.reduce((s, l) => s + l.basePaise, 0);
  const taxPaise = lines.reduce((s, l) => s + l.gstPaise, 0);
  const discountPaise = lines.reduce((s, l) => s + l.discountPaise, 0);
  return { lines, subtotalPaise, taxPaise, discountPaise, grandTotalPaise };
}

export function buildHistoricalLedgerPlan(input: {
  customerId: string;
  grandTotalPaise: number;
  paymentMethod: FyhPaymentMethod;
}) {
  const ledgerMethod: 'cash' | 'upi' | 'card' =
    input.paymentMethod === 'upi'
      ? 'upi'
      : input.paymentMethod === 'card'
        ? 'card'
        : 'cash';
  return planCheckoutLedger({
    customerId: input.customerId,
    grandTotalPaise: input.grandTotalPaise,
    payments: [{ id: 'pay-1', method: ledgerMethod, amountPaise: input.grandTotalPaise }],
    flags: {},
  });
}

export function validateHistoricalRow(row: HistoricalSalesRow): string | null {
  if (!row.customerName.trim()) return 'customer_name is required';
  if (!row.description.trim() && !row.lineItems.length) return 'description is required';
  if (row.amountPaise <= 0) return 'amount_inr must be greater than zero';
  if (!['cash', 'upi', 'card', 'bank'].includes(row.paymentMethod)) {
    return 'payment_method must be cash, upi, card, or bank';
  }
  return null;
}

export function buildHistoricalInvoiceNotes(originalRef?: string): string {
  const base = 'Imported Historical Entry';
  if (!originalRef?.trim()) return base;
  return `${base} · original ref: ${originalRef.trim()}`;
}

