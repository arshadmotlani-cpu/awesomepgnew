import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';
import type { AdminPaidElectricityCollectionRow } from '@/src/db/queries/admin';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { titleCase } from '@/src/lib/format';

export type BillingCollectionKind = 'rent' | 'electricity';

export type BillingRecentCollectionRow = {
  id: string;
  kind: BillingCollectionKind;
  customerId?: string;
  customerFullName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string;
  bedCode?: string;
  amountPaise: number;
  paidAt: Date | null;
  paymentMode: string | null;
  collectedBy: string | null;
  invoiceNumber: string;
  billingMonth: string;
  paymentStatus: string;
};

export type BillingCollectionDateFilter = 'today' | 'yesterday' | 'week' | 'month';

export const BILLING_COLLECTION_DATE_FILTERS: Array<{
  id: BillingCollectionDateFilter;
  label: string;
}> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

function formatPaymentModeLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  if (provider === 'cash') return 'Cash';
  if (provider === 'upi_manual' || provider === 'razorpay' || provider === 'stripe') return 'UPI';
  if (provider === 'bank_transfer') return 'Bank transfer';
  if (provider === 'mock') return 'Other';
  return titleCase(provider.replace(/_/g, ' '));
}

function collectedByFromPaymentPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;
  if (payload.source !== 'admin_cash_settlement') return null;
  const name = payload.receivedByAdminName;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return null;
}

export function resolvePaymentCollectedBy(
  provider: string | null | undefined,
  rawPayload: unknown,
): string {
  const fromPayload = collectedByFromPaymentPayload(rawPayload);
  if (fromPayload) return fromPayload;
  if (provider === 'cash') return 'Admin';
  if (provider) return 'Payment gateway';
  return '—';
}

export function rentInvoiceToCollectionRow(row: AdminRentInvoiceRow): BillingRecentCollectionRow {
  const amount =
    row.paidPrincipalPaise + row.paidLateFeePaise > 0
      ? row.paidPrincipalPaise + row.paidLateFeePaise
      : (row.outstandingPaise ?? row.rentPaise);
  return {
    id: `rent-${row.id}`,
    kind: 'rent',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    amountPaise: amount,
    paidAt: row.paidAt,
    paymentMode: formatPaymentModeLabel(row.paymentProvider),
    collectedBy: resolvePaymentCollectedBy(row.paymentProvider, row.paymentRawPayload),
    invoiceNumber: row.invoiceNumber,
    billingMonth: row.billingMonth,
    paymentStatus: titleCase((row.effectiveStatus ?? row.status).replace(/_/g, ' ')),
  };
}

export function electricityInvoiceToCollectionRow(
  row: AdminPaidElectricityCollectionRow,
): BillingRecentCollectionRow {
  return {
    id: `elec-${row.id}`,
    kind: 'electricity',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    amountPaise: row.amountPaise,
    paidAt: row.paidAt,
    paymentMode: formatPaymentModeLabel(row.paymentProvider),
    collectedBy: resolvePaymentCollectedBy(row.paymentProvider, row.paymentRawPayload),
    invoiceNumber: row.invoiceNumber,
    billingMonth: row.billingMonth,
    paymentStatus: titleCase(row.effectiveStatus.replace(/_/g, ' ')),
  };
}

function dateInBillingTimezone(value: Date): string {
  const tz = 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function startOfWeekIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return addDays(iso, -diff);
}

export function filterBillingCollectionsByDate(
  rows: BillingRecentCollectionRow[],
  filter: BillingCollectionDateFilter,
  now: Date = new Date(),
): BillingRecentCollectionRow[] {
  const today = todayInBillingTimezone(now);
  const yesterday = addDays(today, -1);
  const weekStart = startOfWeekIso(today);
  const monthStart = `${today.slice(0, 7)}-01`;

  return rows.filter((row) => {
    if (!row.paidAt) return false;
    const paidDate = dateInBillingTimezone(row.paidAt);
    switch (filter) {
      case 'today':
        return paidDate === today;
      case 'yesterday':
        return paidDate === yesterday;
      case 'week':
        return paidDate >= weekStart && paidDate <= today;
      case 'month':
        return paidDate >= monthStart && paidDate <= today;
      default:
        return true;
    }
  });
}

export function sortBillingCollections(
  rows: BillingRecentCollectionRow[],
): BillingRecentCollectionRow[] {
  return [...rows].sort((a, b) => {
    const aTime = a.paidAt?.getTime() ?? 0;
    const bTime = b.paidAt?.getTime() ?? 0;
    return bTime - aTime;
  });
}
