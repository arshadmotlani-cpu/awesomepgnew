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

function dateInBillingTimezone(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function todayInBillingTimezone(now: Date = new Date()): string {
  return dateInBillingTimezone(now);
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
