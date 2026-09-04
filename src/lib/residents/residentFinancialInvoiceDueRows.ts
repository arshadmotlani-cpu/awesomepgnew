/**
 * Map payable financial_invoices (room-change / custom / etc.) into Bills Due rows.
 * Mirrors residentFinancialEngine "other" category — excludes pay-all aggregates.
 */
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';
import { isResidentPortalPayAllSource } from '@/src/lib/residents/residentPayableNowProjection';
import { ROOM_CHANGE_INVOICE_SOURCE } from '@/src/services/roomShiftQuote';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import { titleCase } from '@/src/lib/format';

function labelStatus(value: string): string {
  return titleCase(value.replace(/_/g, ' '));
}

function roomChangeDueLabel(args: {
  notes: string | null;
  sourceTable: string | null;
  roomNumber: string | null;
  bedCode: string | null;
}): string {
  const base = args.notes?.trim() || 'Change Bed charge';
  if (
    args.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.fee ||
    args.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.newRent ||
    args.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.oldRent ||
    args.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.deposit
  ) {
    if (args.roomNumber && args.bedCode) {
      return `Change Bed · Room ${args.roomNumber} · ${base}`;
    }
    return `Change Bed · ${base}`;
  }
  return base;
}

export function isRoomChangePayAllSource(sourceTable: string | null | undefined): boolean {
  return sourceTable === ROOM_CHANGE_INVOICE_SOURCE.payAll;
}

/** Pure mapper for unit tests. */
export function mapFinancialInvoiceToDueRow(input: {
  id: string;
  invoiceNumber: string;
  notes: string | null;
  sourceTable: string | null;
  amountPaise: number;
  paidPaise: number;
  status: string;
  dueDate: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  paymentLinkId: string | null;
}): PaymentDueRow | null {
  if (isRoomChangePayAllSource(input.sourceTable)) return null;
  if (isResidentPortalPayAllSource(input.sourceTable)) return null;
  const outstanding = Math.max(0, input.amountPaise - input.paidPaise);
  if (outstanding <= 0) return null;

  const href = input.paymentLinkId
    ? `/pay/${input.paymentLinkId}`
    : invoiceDetailHref(input.id, 'resident');

  return {
    key: `fi-${input.id}`,
    label: roomChangeDueLabel({
      notes: input.notes,
      sourceTable: input.sourceTable,
      roomNumber: input.roomNumber,
      bedCode: input.bedCode,
    }),
    amountPaise: outstanding,
    dueDate: input.dueDate,
    href,
    status: labelStatus(input.status),
    invoiceNumber: input.invoiceNumber,
  };
}

/**
 * Payable non-rent/non-electricity financial invoices for Bills Due.
 * Includes room-change children + room-change deposit top-ups; excludes pay-all.
 */
export async function listResidentFinancialInvoiceDueRows(
  customerId: string,
): Promise<PaymentDueRow[]> {
  const rows = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      notes: financialInvoices.notes,
      sourceTable: financialInvoices.sourceTable,
      amountPaise: financialInvoices.amountPaise,
      status: financialInvoices.status,
      dueDate: financialInvoices.dueDate,
      roomNumber: financialInvoices.roomNumber,
      bedCode: financialInvoices.bedCode,
      paymentLinkId: financialInvoices.paymentLinkId,
      breakdown: financialInvoices.breakdown,
      invoiceType: financialInvoices.invoiceType,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.customerId, customerId),
        eq(financialInvoices.isDocumentOnly, false),
        inArray(financialInvoices.status, ['draft', 'sent', 'overdue', 'partial']),
        or(
          inArray(financialInvoices.invoiceType, [
            'custom',
            'penalty',
            'damage',
            'ps4',
            'room_shift',
          ]),
          and(
            eq(financialInvoices.invoiceType, 'deposit'),
            eq(financialInvoices.sourceTable, ROOM_CHANGE_INVOICE_SOURCE.deposit),
          ),
        ),
      ),
    );

  const due: PaymentDueRow[] = [];
  for (const row of rows) {
    if (isRoomChangePayAllSource(row.sourceTable)) continue;
    if (isResidentPortalPayAllSource(row.sourceTable)) continue;
    const paidPaise =
      row.breakdown?.paidPaise ?? (row.status === 'paid' ? row.amountPaise : 0);
    const mapped = mapFinancialInvoiceToDueRow({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      notes: row.notes,
      sourceTable: row.sourceTable,
      amountPaise: row.amountPaise,
      paidPaise,
      status: row.status,
      dueDate: row.dueDate,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      paymentLinkId: row.paymentLinkId,
    });
    if (mapped) due.push(mapped);
  }
  return due;
}
