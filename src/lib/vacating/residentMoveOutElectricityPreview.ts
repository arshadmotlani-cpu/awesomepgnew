/**
 * Move-out electricity preview — read-only; never creates invoices.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, rooms } from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import { buildResidentElectricityAccount } from '@/src/lib/residents/residentElectricityAccount';
import { loadResidentElectricityBillingState } from '@/src/lib/residents/residentElectricityBillingState';

export type ResidentMoveOutElectricityPreview = {
  previousBillPaise: number;
  previousBillStatus: 'pending' | 'paid' | 'none';
  previousBillingMonthLabel: string | null;
  currentStayLabel: string;
  currentStayPaise: number | null;
  currentStayPending: boolean;
  finalAmountPaise: number | null;
  finalAmountPending: boolean;
  summaryLine: string;
};

function monthLabel(billingMonth: string): string {
  const d = new Date(`${billingMonth.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

async function resolvePrimaryRoomId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ roomId: rooms.id })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);
  return row?.roomId ?? null;
}

export async function buildResidentMoveOutElectricityPreview(input: {
  bookingId: string;
  vacatingDate: string;
}): Promise<ResidentMoveOutElectricityPreview> {
  const checkoutMonth = firstOfMonth(input.vacatingDate);
  const checkoutMonthKey = checkoutMonth.slice(0, 7);

  const [elecAccount, roomId] = await Promise.all([
    buildResidentElectricityAccount(input.bookingId),
    resolvePrimaryRoomId(input.bookingId),
  ]);

  const previousInvoices = elecAccount.invoices.filter(
    (inv) => inv.billingMonth.slice(0, 7) < checkoutMonthKey && inv.outstandingPaise > 0,
  );
  const previousBillPaise = previousInvoices.reduce((sum, inv) => sum + inv.outstandingPaise, 0);
  const previousBillingMonthLabel =
    previousInvoices.length > 0
      ? monthLabel(previousInvoices[previousInvoices.length - 1]!.billingMonth)
      : null;

  const currentMonthOutstanding = elecAccount.invoices.find(
    (inv) => inv.billingMonth.slice(0, 7) === checkoutMonthKey && inv.outstandingPaise > 0,
  );

  let currentStayPaise: number | null = currentMonthOutstanding?.outstandingPaise ?? null;
  let currentStayPending = false;

  if (currentStayPaise == null && roomId) {
    const billingState = await loadResidentElectricityBillingState({
      roomId,
      bookingId: input.bookingId,
      billingMonth: checkoutMonth,
      asOf: input.vacatingDate,
    });
    if (billingState?.showPendingCard) {
      currentStayPending = true;
      currentStayPaise = null;
    } else if (currentMonthOutstanding) {
      currentStayPaise = currentMonthOutstanding.outstandingPaise;
    }
  }

  const vacatingLabel = new Date(`${input.vacatingDate}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
  });

  const previousBillStatus: ResidentMoveOutElectricityPreview['previousBillStatus'] =
    previousBillPaise > 0 ? 'pending' : 'none';

  const knownTotal =
    previousBillPaise + (currentStayPaise ?? 0) > 0
      ? previousBillPaise + (currentStayPaise ?? 0)
      : null;

  const finalAmountPending = currentStayPending && previousBillPaise === 0 && !currentStayPaise;

  return {
    previousBillPaise,
    previousBillStatus,
    previousBillingMonthLabel,
    currentStayLabel: `Calculated through ${vacatingLabel}`,
    currentStayPaise,
    currentStayPending,
    finalAmountPaise: finalAmountPending ? null : knownTotal,
    finalAmountPending,
    summaryLine: finalAmountPending
      ? 'Electricity for your stay will be included in final settlement once the bill is ready.'
      : knownTotal != null && knownTotal > 0
        ? 'These amounts will be included in your final settlement.'
        : 'No electricity due is on record yet for this move-out.',
  };
}
