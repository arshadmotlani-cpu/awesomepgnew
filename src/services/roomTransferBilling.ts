/**
 * Room-change billing — real financial_invoices using existing SSOT.
 * Idempotent on (sourceTable, sourceId) unique index.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, roomChangeRequests, rooms, beds, floors } from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { formatDate } from '@/src/lib/dates';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import { createInvoiceShareToken, invoicePublicSharePath } from '@/src/lib/billing/invoiceShareToken';
import { createPaymentLinkForInvoice } from '@/src/services/unifiedInvoices';
import {
  ROOM_CHANGE_INVOICE_SOURCE,
  type RoomShiftQuoteSnapshot,
} from '@/src/services/roomShiftQuote';
import {
  recordResidentCredit,
  hasResidentCreditEntryWithReasonPrefix,
} from '@/src/services/residentCreditLedger';

export const ROOM_CHANGE_CREDIT_REASON_PREFIX = 'room_change_unused_rent:';
export const ROOM_CHANGE_CREDIT_APPLY_PREFIX = 'room_change_credit_apply:';

function roomChangeDueDate(expiresAt?: Date | null): string {
  return formatDate(expiresAt ?? new Date());
}

async function destinationContext(toBedId: string): Promise<{
  pgId: string;
  roomNumber: string;
  bedCode: string;
}> {
  const [row] = await db
    .select({
      pgId: floors.pgId,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(beds.id, toBedId))
    .limit(1);
  if (!row) throw new Error('Destination bed not found.');
  return row;
}

async function upsertRoomChangeInvoice(input: {
  requestId: string;
  customerId: string;
  bookingId: string;
  pgId: string;
  roomNumber: string;
  bedCode: string;
  sourceTable: string;
  amountPaise: number;
  label: string;
  invoiceType: 'room_shift' | 'deposit';
  breakdown: InvoiceBreakdown;
  expiresAt?: Date | null;
}): Promise<string | null> {
  if (input.amountPaise <= 0) return null;

  const [existing] = await db
    .select({ id: financialInvoices.id, status: financialInvoices.status })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, input.sourceTable),
        eq(financialInvoices.sourceId, input.requestId),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const invoiceNumber = await nextFinancialInvoiceNumber({ pgId: input.pgId });
  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType: input.invoiceType,
      sourceTable: input.sourceTable,
      sourceId: input.requestId,
      customerId: input.customerId,
      bookingId: input.bookingId,
      pgId: input.pgId,
      roomNumber: input.roomNumber,
      bedCode: input.bedCode,
      amountPaise: input.amountPaise,
      breakdown: input.breakdown,
      status: 'sent',
      dueDate: roomChangeDueDate(input.expiresAt),
      sentAt: new Date(),
      notes: input.label,
      shareToken: createInvoiceShareToken(),
    })
    .returning({ id: financialInvoices.id });

  await createPaymentLinkForInvoice(row.id).catch(() => undefined);
  return row.id;
}

export async function ensureRoomChangeInvoices(input: {
  requestId: string;
  customerId: string;
  bookingId: string;
  quote: RoomShiftQuoteSnapshot;
}): Promise<{
  quote: RoomShiftQuoteSnapshot;
  payAllHref: string | null;
  individual: Array<{ label: string; amountPaise: number; href: string | null; invoiceId: string }>;
}> {
  const dest = await destinationContext(input.quote.toBedId);
  const [request] = await db
    .select({ expiresAt: roomChangeRequests.expiresAt })
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, input.requestId))
    .limit(1);
  const invoiceIds: NonNullable<RoomShiftQuoteSnapshot['invoiceIds']> = {
    ...(input.quote.invoiceIds ?? {}),
  };

  const children: Array<{
    key: keyof typeof ROOM_CHANGE_INVOICE_SOURCE;
    amountPaise: number;
    label: string;
    invoiceType: 'room_shift' | 'deposit';
    kind: string;
  }> = [
    {
      key: 'oldRent',
      amountPaise: input.quote.oldRentDueAfterCreditPaise,
      label: 'Outstanding old-room rent',
      invoiceType: 'room_shift',
      kind: 'rent',
    },
    {
      key: 'newRent',
      amountPaise: input.quote.newRentDuePaise,
      label: 'New-room remaining rent',
      invoiceType: 'room_shift',
      kind: 'rent',
    },
    {
      key: 'fee',
      amountPaise: input.quote.feeDuePaise,
      label: 'Room change fee',
      invoiceType: 'room_shift',
      kind: 'custom',
    },
    {
      key: 'deposit',
      amountPaise: input.quote.depositDuePaise,
      label: 'Additional deposit',
      invoiceType: 'deposit',
      kind: 'deposit',
    },
  ];

  for (const child of children) {
    const id = await upsertRoomChangeInvoice({
      requestId: input.requestId,
      customerId: input.customerId,
      bookingId: input.bookingId,
      pgId: dest.pgId,
      roomNumber: dest.roomNumber,
      bedCode: dest.bedCode,
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE[child.key],
      amountPaise: child.amountPaise,
      label: child.label,
      invoiceType: child.invoiceType,
      breakdown: {
        rentPaise: child.kind === 'rent' ? child.amountPaise : 0,
        depositPaise: child.kind === 'deposit' ? child.amountPaise : 0,
        otherPaise: child.kind === 'custom' ? child.amountPaise : 0,
        lines: [
          {
            kind: child.kind,
            label: child.label,
            amountPaise: child.amountPaise,
            sourceTable: ROOM_CHANGE_INVOICE_SOURCE[child.key],
            sourceId: input.requestId,
          },
        ],
      },
      expiresAt: request?.expiresAt,
    });
    if (id) invoiceIds[child.key] = id;
  }

  const payAllLines = children
    .filter((c) => c.amountPaise > 0)
    .map((c) => ({
      kind: c.kind,
      label: c.label,
      amountPaise: c.amountPaise,
      sourceTable: 'financial_invoices',
      sourceId: invoiceIds[c.key] ?? null,
    }));

  let payAllId = invoiceIds.payAll ?? null;
  if (input.quote.totalDuePaise > 0) {
    payAllId = await upsertRoomChangeInvoice({
      requestId: input.requestId,
      customerId: input.customerId,
      bookingId: input.bookingId,
      pgId: dest.pgId,
      roomNumber: dest.roomNumber,
      bedCode: dest.bedCode,
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
      amountPaise: input.quote.totalDuePaise,
      label: 'Room change — pay all',
      invoiceType: 'room_shift',
      breakdown: {
        rentPaise: input.quote.oldRentDueAfterCreditPaise + input.quote.newRentDuePaise,
        depositPaise: input.quote.depositDuePaise,
        otherPaise: input.quote.feeDuePaise,
        lines: payAllLines,
      },
      expiresAt: request?.expiresAt,
    });
    if (payAllId) invoiceIds.payAll = payAllId;
  }

  const quote: RoomShiftQuoteSnapshot = { ...input.quote, invoiceIds };

  const individual: Array<{
    label: string;
    amountPaise: number;
    href: string | null;
    invoiceId: string;
  }> = [];
  for (const child of children) {
    const id = invoiceIds[child.key];
    if (!id || child.amountPaise <= 0) continue;
    const [inv] = await db
      .select({ shareToken: financialInvoices.shareToken })
      .from(financialInvoices)
      .where(eq(financialInvoices.id, id))
      .limit(1);
    individual.push({
      label: child.label,
      amountPaise: child.amountPaise,
      href: inv?.shareToken ? invoicePublicSharePath(inv.shareToken) : null,
      invoiceId: id,
    });
  }

  let payAllHref: string | null = null;
  if (payAllId) {
    const [inv] = await db
      .select({ shareToken: financialInvoices.shareToken, paymentLinkId: financialInvoices.paymentLinkId })
      .from(financialInvoices)
      .where(eq(financialInvoices.id, payAllId))
      .limit(1);
    if (inv?.paymentLinkId) {
      payAllHref = `/pay/${inv.paymentLinkId}`;
    } else if (inv?.shareToken) {
      payAllHref = invoicePublicSharePath(inv.shareToken);
    }
  }

  return { quote, payAllHref, individual };
}

export function roomChangeChargesSettledFromRows(
  rows: Array<{ sourceTable: string | null; status: string; amountPaise: number }>,
): boolean {
  const payable = rows.filter(
    (r) =>
      r.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.oldRent ||
      r.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.newRent ||
      r.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.fee ||
      r.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.deposit ||
      r.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.payAll,
  );
  if (payable.length === 0) return true;

  const payAll = payable.find((r) => r.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.payAll);
  if (payAll && (payAll.status === 'paid' || payAll.status === 'settled')) {
    return true;
  }

  const children = payable.filter((r) => r.sourceTable !== ROOM_CHANGE_INVOICE_SOURCE.payAll);
  const dueChildren = children.filter((r) => r.amountPaise > 0);
  if (dueChildren.length === 0) return true;
  return dueChildren.every(
    (r) => r.status === 'paid' || r.status === 'settled',
  );
}

export async function roomChangeChargesSettled(requestId: string): Promise<boolean> {
  const rows = await db
    .select({
      sourceTable: financialInvoices.sourceTable,
      status: financialInvoices.status,
      amountPaise: financialInvoices.amountPaise,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.sourceId, requestId));

  if (rows.length === 0) {
    const [request] = await db
      .select({ quoteSnapshot: roomChangeRequests.quoteSnapshot })
      .from(roomChangeRequests)
      .where(eq(roomChangeRequests.id, requestId))
      .limit(1);
    const quote = request?.quoteSnapshot as RoomShiftQuoteSnapshot | null;
    return (quote?.totalDuePaise ?? 0) <= 0;
  }
  return roomChangeChargesSettledFromRows(rows);
}

export async function roomChangeSettlementTimestamp(requestId: string): Promise<Date | null> {
  const rows = await db
    .select({
      sourceTable: financialInvoices.sourceTable,
      status: financialInvoices.status,
      amountPaise: financialInvoices.amountPaise,
      paidAt: financialInvoices.paidAt,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.sourceId, requestId));

  if (rows.length === 0) {
    const [request] = await db
      .select({
        quoteSnapshot: roomChangeRequests.quoteSnapshot,
        heldAt: roomChangeRequests.heldAt,
        createdAt: roomChangeRequests.createdAt,
      })
      .from(roomChangeRequests)
      .where(eq(roomChangeRequests.id, requestId))
      .limit(1);
    const quote = request?.quoteSnapshot as RoomShiftQuoteSnapshot | null;
    return (quote?.totalDuePaise ?? 0) <= 0
      ? request?.heldAt ?? request?.createdAt ?? null
      : null;
  }
  if (!roomChangeChargesSettledFromRows(rows)) return null;
  const payAll = rows.find(
    (row) =>
      row.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.payAll &&
      (row.status === 'paid' || row.status === 'settled'),
  );
  if (payAll?.paidAt) return payAll.paidAt;

  const requiredChildren = rows.filter(
    (row) =>
      row.amountPaise > 0 &&
      row.sourceTable !== ROOM_CHANGE_INVOICE_SOURCE.payAll,
  );
  if (requiredChildren.length === 0) return new Date(0);
  const paidTimes = requiredChildren.map((row) => row.paidAt?.getTime() ?? 0);
  if (paidTimes.some((time) => time === 0)) return null;
  return new Date(Math.max(...paidTimes));
}

/** Credit wallet surplus from quote after transfer completes (idempotent). */
export async function applyRoomChangeWalletSurplusOnComplete(input: {
  requestId: string;
  customerId: string;
  bookingId: string;
  walletSurplusPaise: number;
}): Promise<void> {
  if (input.walletSurplusPaise <= 0) return;
  const reason = `${ROOM_CHANGE_CREDIT_REASON_PREFIX}${input.requestId}:surplus`;
  const already = await hasResidentCreditEntryWithReasonPrefix(input.customerId, reason);
  if (already) return;
  await recordResidentCredit({
    customerId: input.customerId,
    bookingId: input.bookingId,
    amountPaise: input.walletSurplusPaise,
    reason,
  });
}

export async function markRoomChangeChildInvoicesPaidFromPayAll(payAllInvoiceId: string): Promise<void> {
  const [payAll] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, payAllInvoiceId))
    .limit(1);
  if (!payAll || payAll.sourceTable !== ROOM_CHANGE_INVOICE_SOURCE.payAll) return;
  const lines = payAll.breakdown?.lines ?? [];
  for (const line of lines) {
    if (line.sourceTable === 'financial_invoices' && line.sourceId) {
      const { allocateInvoicePayment } = await import('@/src/services/invoicePayment');
      const result = await allocateInvoicePayment({
        invoiceId: line.sourceId,
        amountPaise: line.amountPaise,
        providerPaymentId: `room-change-pay-all:${payAllInvoiceId}:${line.sourceId}`,
      });
      if (!result.ok && result.error !== 'Invoice is already paid.') {
        throw new Error(result.error);
      }
    }
  }
}
