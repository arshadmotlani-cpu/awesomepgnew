/**
 * Room-change settlement projection — read-only status for resident/admin UI.
 * Three operational states: deposit approved ≠ charges settled ≠ transfer completed.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, paymentLinks, roomChangeRequests } from '@/src/db/schema';
import { ROOM_CHANGE_INVOICE_SOURCE } from '@/src/services/roomShiftQuote';
import {
  roomChangeChargesSettled,
  roomChangeChargesSettledFromRows,
} from '@/src/services/roomTransferBilling';

export type RoomChangeSettlementPhase =
  | 'none'
  | 'deposit_pending'
  | 'deposit_approved'
  | 'charges_payable'
  | 'ready_to_transfer'
  | 'transfer_completed';

export type RoomChangeSettlementStatus = {
  requestId: string | null;
  phase: RoomChangeSettlementPhase;
  requestStatus: string | null;
  depositInvoicePaid: boolean;
  chargesSettled: boolean;
  outstandingPaise: number;
  message: string;
};

export async function projectRoomChangeSettlementStatus(input: {
  bookingId: string;
  requestId?: string | null;
}): Promise<RoomChangeSettlementStatus> {
  const [request] = input.requestId
    ? await db
        .select()
        .from(roomChangeRequests)
        .where(eq(roomChangeRequests.id, input.requestId))
        .limit(1)
    : await db
        .select()
        .from(roomChangeRequests)
        .where(eq(roomChangeRequests.bookingId, input.bookingId))
        .orderBy(desc(roomChangeRequests.createdAt))
        .limit(1);

  if (!request) {
    return {
      requestId: null,
      phase: 'none',
      requestStatus: null,
      depositInvoicePaid: false,
      chargesSettled: false,
      outstandingPaise: 0,
      message: '',
    };
  }

  if (request.status === 'completed') {
    return {
      requestId: request.id,
      phase: 'transfer_completed',
      requestStatus: request.status,
      depositInvoicePaid: true,
      chargesSettled: true,
      outstandingPaise: 0,
      message: 'Room change completed.',
    };
  }

  const invoiceRows = await db
    .select({
      sourceTable: financialInvoices.sourceTable,
      status: financialInvoices.status,
      amountPaise: financialInvoices.amountPaise,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.sourceId, request.id));

  const depositRow = invoiceRows.find(
    (r) => r.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.deposit,
  );
  const depositInvoicePaid =
    depositRow?.status === 'paid' || depositRow?.status === 'settled';

  const [depositLink] = await db
    .select({ status: paymentLinks.status })
    .from(paymentLinks)
    .innerJoin(financialInvoices, eq(financialInvoices.id, paymentLinks.invoiceId))
    .where(
      and(
        eq(paymentLinks.bookingId, input.bookingId),
        eq(paymentLinks.purpose, 'deposit'),
        eq(financialInvoices.sourceId, request.id),
      ),
    )
    .limit(1);

  const depositLinkPaid = depositLink?.status === 'paid';
  const depositRecorded = depositInvoicePaid || depositLinkPaid;

  const chargesSettled = roomChangeChargesSettledFromRows(invoiceRows);

  const outstandingPaise = invoiceRows
    .filter(
      (r) =>
        r.sourceTable !== ROOM_CHANGE_INVOICE_SOURCE.payAll &&
        r.amountPaise > 0 &&
        r.status !== 'paid' &&
        r.status !== 'settled' &&
        r.status !== 'cancelled',
    )
    .reduce((sum, r) => sum + r.amountPaise, 0);

  let phase: RoomChangeSettlementPhase;
  let message: string;

  if (chargesSettled) {
    phase = 'ready_to_transfer';
    message =
      'All room-change charges are paid. Transfer will complete when the transfer date is reached and the destination bed is available.';
  } else if (depositRecorded && !chargesSettled) {
    phase = 'deposit_approved';
    message = `Deposit recorded. Outstanding room-change charges: ${(outstandingPaise / 100).toFixed(2)} INR still payable before transfer.`;
  } else if (!depositRecorded) {
    phase = 'deposit_pending';
    message = 'Additional deposit payment is pending approval or payment.';
  } else {
    phase = 'charges_payable';
    message = 'Room-change charges are payable. Pay individual invoices or pay all.';
  }

  if (!depositRecorded && outstandingPaise > 0) {
    phase = 'charges_payable';
    message = 'Room-change charges are payable. Pay individual invoices or pay all.';
  }

  return {
    requestId: request.id,
    phase,
    requestStatus: request.status,
    depositInvoicePaid: depositRecorded,
    chargesSettled,
    outstandingPaise,
    message,
  };
}

export async function projectRoomChangeSettlementStatusByRequestId(
  requestId: string,
): Promise<RoomChangeSettlementStatus> {
  const [request] = await db
    .select({ bookingId: roomChangeRequests.bookingId })
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, requestId))
    .limit(1);
  if (!request) {
    return {
      requestId: null,
      phase: 'none',
      requestStatus: null,
      depositInvoicePaid: false,
      chargesSettled: false,
      outstandingPaise: 0,
      message: '',
    };
  }
  return projectRoomChangeSettlementStatus({
    bookingId: request.bookingId,
    requestId,
  });
}

/** Re-export for tests — settlement check without extra query. */
export { roomChangeChargesSettled };
