import { addDays, diffDays, formatDate, parseDate } from '@/src/lib/dates';
import type { AdminElectricityInvoiceReminderRow } from '@/src/db/queries/admin';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';

export type CollectionPriority = 'overdue' | 'due_today' | 'due_soon' | 'pending';

export type CollectionQueueItem = {
  id: string;
  kind: 'rent' | 'electricity';
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode?: string;
  bookingId?: string;
  sourceTable: 'rent_invoices' | 'electricity_invoices';
  sourceId: string;
  financialInvoiceId?: string | null;
  invoiceNumber: string;
  amountPaise: number;
  dueDate: string;
  daysOverdue: number;
  priority: CollectionPriority;
  effectiveStatus: string;
  invoiceLabel: string;
};

export type CollectionsCommandStats = {
  overdueCount: number;
  overdueAmountPaise: number;
  dueTodayCount: number;
  dueTodayAmountPaise: number;
  dueThisWeekCount: number;
  dueThisWeekAmountPaise: number;
  collectedTodayCount: number;
  collectedTodayAmountPaise: number;
};

function todayIso(): string {
  return formatDate(new Date());
}

function classifyDueDate(dueDate: string, today: string): CollectionPriority {
  const daysUntilDue = diffDays(today, dueDate);
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'due_today';
  if (daysUntilDue <= 3) return 'due_soon';
  return 'pending';
}

const PRIORITY_ORDER: Record<CollectionPriority, number> = {
  overdue: 0,
  due_today: 1,
  due_soon: 2,
  pending: 3,
};

function sortQueue(a: CollectionQueueItem, b: CollectionQueueItem): number {
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (p !== 0) return p;
  if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
  return parseDate(a.dueDate).getTime() - parseDate(b.dueDate).getTime();
}

export function rentRowToQueueItem(row: AdminRentInvoiceRow, today: string): CollectionQueueItem | null {
  if (row.outstandingPaise <= 0) return null;
  if (row.effectiveStatus === 'paid' || row.effectiveStatus === 'cancelled') return null;

  if (row.effectiveStatus === 'payment_in_progress') return null;

  const priority =
    row.effectiveStatus === 'overdue'
      ? 'overdue'
      : classifyDueDate(row.dueDate, today);

  const daysOverdue = Math.max(0, diffDays(row.dueDate, today));

  return {
    id: `rent-${row.id}`,
    kind: 'rent',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    bookingId: row.bookingId,
    sourceTable: 'rent_invoices',
    sourceId: row.id,
    invoiceNumber: row.invoiceNumber,
    amountPaise: row.outstandingPaise,
    dueDate: row.dueDate,
    daysOverdue,
    priority,
    effectiveStatus: row.effectiveStatus,
    invoiceLabel: `Rent · ${row.billingMonth.slice(0, 7)}`,
  };
}

export function electricityRowToQueueItem(
  row: AdminElectricityInvoiceReminderRow,
  today: string,
): CollectionQueueItem | null {
  if (row.outstandingPaise <= 0) return null;

  if (row.paymentProofUrl) return null;

  const priority = row.isOverdue ? 'overdue' : classifyDueDate(row.dueDate, today);

  const daysOverdue = Math.max(0, diffDays(row.dueDate, today));

  return {
    id: `elec-${row.id}`,
    kind: 'electricity',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    sourceTable: 'electricity_invoices',
    sourceId: row.id,
    invoiceNumber: row.invoiceNumber,
    amountPaise: row.outstandingPaise,
    dueDate: row.dueDate,
    daysOverdue,
    priority,
    effectiveStatus: row.effectiveStatus,
    invoiceLabel: `Electricity · ${row.billingMonth.slice(0, 7)}`,
  };
}

export function buildCollectionsQueue(input: {
  rentRows: AdminRentInvoiceRow[];
  electricityRows: AdminElectricityInvoiceReminderRow[];
}): CollectionQueueItem[] {
  const today = todayIso();
  const items: CollectionQueueItem[] = [];

  for (const row of input.rentRows) {
    const item = rentRowToQueueItem(row, today);
    if (item) items.push(item);
  }
  for (const row of input.electricityRows) {
    const item = electricityRowToQueueItem(row, today);
    if (item) items.push(item);
  }

  return items.sort(sortQueue);
}

export function buildCollectionsCommandStats(input: {
  queue: CollectionQueueItem[];
  allUnpaidRent: AdminRentInvoiceRow[];
  allUnpaidElectricity: AdminElectricityInvoiceReminderRow[];
  paidTodayRows: Array<{ outstandingPaise?: number; rentPaise?: number; paidAt?: Date | null }>;
}): CollectionsCommandStats {
  const today = todayIso();
  const weekEnd = formatDate(addDays(today, 7));

  let overdueCount = 0;
  let overdueAmountPaise = 0;
  let dueTodayCount = 0;
  let dueTodayAmountPaise = 0;
  let dueThisWeekCount = 0;
  let dueThisWeekAmountPaise = 0;

  const countUnpaid = (
    amountPaise: number,
    dueDate: string,
    isOverdueFlag: boolean,
    effectiveStatus: string,
  ) => {
    if (amountPaise <= 0) return;
    const daysUntil = diffDays(today, dueDate);
    const overdue =
      isOverdueFlag || effectiveStatus === 'overdue' || daysUntil < 0;

    if (overdue) {
      overdueCount += 1;
      overdueAmountPaise += amountPaise;
    }
    if (daysUntil === 0) {
      dueTodayCount += 1;
      dueTodayAmountPaise += amountPaise;
    }
    if (daysUntil > 0 && dueDate <= weekEnd) {
      dueThisWeekCount += 1;
      dueThisWeekAmountPaise += amountPaise;
    }
  };

  for (const r of input.allUnpaidRent) {
    if (r.outstandingPaise <= 0 || r.effectiveStatus === 'paid' || r.effectiveStatus === 'cancelled') {
      continue;
    }
    countUnpaid(r.outstandingPaise, r.dueDate, r.effectiveStatus === 'overdue', r.effectiveStatus);
  }
  for (const e of input.allUnpaidElectricity) {
    if (e.outstandingPaise <= 0) continue;
    countUnpaid(e.outstandingPaise, e.dueDate, e.isOverdue, e.effectiveStatus);
  }

  let collectedTodayCount = 0;
  let collectedTodayAmountPaise = 0;
  for (const p of input.paidTodayRows) {
    if (!p.paidAt) continue;
    const paidDay = formatDate(p.paidAt);
    if (paidDay !== today) continue;
    collectedTodayCount += 1;
    collectedTodayAmountPaise += p.outstandingPaise ?? p.rentPaise ?? 0;
  }

  return {
    overdueCount,
    overdueAmountPaise,
    dueTodayCount,
    dueTodayAmountPaise,
    dueThisWeekCount,
    dueThisWeekAmountPaise,
    collectedTodayCount,
    collectedTodayAmountPaise,
  };
}

export function prioritySectionLabel(priority: CollectionPriority): string {
  if (priority === 'overdue') return 'Overdue';
  if (priority === 'due_today') return 'Due today';
  if (priority === 'due_soon') return 'Due in next 3 days';
  return 'Pending payment';
}

export function daysOverdueLabel(days: number): string {
  if (days <= 0) return '—';
  if (days === 1) return '1 day';
  return `${days} days`;
}
