import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  bookings,
  electricityBills,
  floors,
  meterLogs,
  roomElectricityPrepaidLedger,
  rooms,
} from '@/src/db/schema';
import { diffDays, formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth, monthBounds } from './billing';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  createElectricityBill,
  projectElectricityInvoice,
} from './electricityBilling';
import { fetchElectricityInvoiceById } from '@/src/lib/db/electricityInvoiceSelect';
import { electricityInvoices } from '@/src/db/schema/electricityInvoices';

export type RecordMeterLogInput = {
  pgId: string;
  roomId: string;
  bookingId?: string | null;
  readingType: 'checkin' | 'monthly' | 'checkout';
  units: number;
  meterImageUrl?: string | null;
  recordedBy: 'admin' | 'tenant' | 'system';
  recordedById?: string | null;
  isEstimated?: boolean;
  recordedAt?: string;
  notes?: string | null;
  ratePerUnitPaise?: number;
  autoCreateBill?: boolean;
};

function assertPgAccess(session: AdminSession, pgId: string) {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    throw new Error('You do not have access to this PG.');
  }
}

export async function recordMeterLog(
  session: AdminSession,
  input: RecordMeterLogInput,
): Promise<{ logId: string; billId?: string }> {
  assertPgAccess(session, input.pgId);

  if (!Number.isFinite(input.units) || input.units < 0) {
    throw new Error('Meter units must be a non-negative number.');
  }

  const [row] = await db
    .insert(meterLogs)
    .values({
      pgId: input.pgId,
      roomId: input.roomId,
      bookingId: input.bookingId ?? null,
      readingType: input.readingType,
      units: input.units.toString(),
      meterImageUrl: input.meterImageUrl?.trim() || null,
      recordedBy: input.recordedBy,
      recordedById: input.recordedById ?? session.adminId,
      isEstimated: input.isEstimated ?? false,
      recordedAt: input.recordedAt ?? formatDate(new Date()),
      notes: input.notes ?? null,
    })
    .returning({ id: meterLogs.id });

  let billId: string | undefined;
  if (input.autoCreateBill && input.readingType === 'monthly' && input.ratePerUnitPaise) {
    const billResult = await createBillFromMeterLogs(session, {
      roomId: input.roomId,
      billingMonth: firstOfMonth(input.recordedAt ?? formatDate(new Date())),
      ratePerUnitPaise: input.ratePerUnitPaise,
      endMeterLogId: row.id,
      meterImageUrl: input.meterImageUrl,
      isEstimated: input.isEstimated ?? false,
    });
    if (billResult.ok) billId = billResult.billId;
  }

  return { logId: row.id, billId };
}

export async function estimateMonthlyUnits(roomId: string, billingMonth: string): Promise<number> {
  const bills = await db
    .select({ units: electricityBills.unitsConsumed })
    .from(electricityBills)
    .where(eq(electricityBills.roomId, roomId))
    .orderBy(desc(electricityBills.billingMonth))
    .limit(3);

  if (bills.length === 0) {
    const logs = await db
      .select({ units: meterLogs.units })
      .from(meterLogs)
      .where(and(eq(meterLogs.roomId, roomId), eq(meterLogs.isEstimated, false)))
      .orderBy(desc(meterLogs.recordedAt))
      .limit(2);
    if (logs.length >= 2) {
      const a = Number(logs[1].units);
      const b = Number(logs[0].units);
      return Math.max(0, Math.round((b - a) * 100) / 100);
    }
    return 0;
  }

  const avg =
    bills.reduce((acc, b) => acc + Number(b.units), 0) / bills.length;
  return Math.round(avg * 100) / 100;
}

/** Average monthly room bill in paise from recent electricity bills or meter logs. */
export async function estimateRoomAverageBillPaise(
  roomId: string,
  ratePerUnitPaise: number,
): Promise<number> {
  const units = await estimateMonthlyUnits(roomId, new Date().toISOString().slice(0, 7));
  if (units <= 0) return 0;
  return Math.round(units * ratePerUnitPaise);
}

export async function createBillFromMeterLogs(
  session: AdminSession,
  input: {
    roomId: string;
    billingMonth: string;
    ratePerUnitPaise: number;
    endMeterLogId?: string;
    startMeterLogId?: string;
    meterImageUrl?: string | null;
    isEstimated?: boolean;
    previousReadingUnits?: number;
    currentReadingUnits?: number;
  },
): Promise<{ ok: true; billId: string } | { ok: false; message: string }> {
  let previous = input.previousReadingUnits;
  let current = input.currentReadingUnits;

  if (input.endMeterLogId) {
    const [endLog] = await db
      .select()
      .from(meterLogs)
      .where(eq(meterLogs.id, input.endMeterLogId))
      .limit(1);
    if (!endLog) return { ok: false, message: 'End meter log not found.' };
    current = Number(endLog.units);

    if (input.startMeterLogId) {
      const [startLog] = await db
        .select()
        .from(meterLogs)
        .where(eq(meterLogs.id, input.startMeterLogId))
        .limit(1);
      if (startLog) previous = Number(startLog.units);
    } else {
      const [prevLog] = await db
        .select()
        .from(meterLogs)
        .where(
          and(eq(meterLogs.roomId, input.roomId), lt(meterLogs.recordedAt, endLog.recordedAt)),
        )
        .orderBy(desc(meterLogs.recordedAt))
        .limit(1);
      previous = prevLog ? Number(prevLog.units) : 0;
    }
  }

  if (previous == null || current == null) {
    return { ok: false, message: 'Could not resolve meter readings.' };
  }

  const result = await createElectricityBill({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    previousReadingUnits: previous,
    currentReadingUnits: current,
    ratePerUnitPaise: input.ratePerUnitPaise,
    createdByAdminId: session.adminId,
    notes: input.isEstimated ? 'Estimated bill (pending meter update)' : null,
    useProRataByActiveDays: true,
  });

  if (!result.ok) {
    if (result.kind === 'already_exists') {
      return { ok: false, message: 'Bill already exists for this room and month.' };
    }
    if (result.kind === 'invalid_input') return { ok: false, message: result.message };
    return { ok: false, message: 'Failed to create bill.' };
  }

  await db
    .update(electricityBills)
    .set({
      isEstimated: input.isEstimated ?? false,
      meterImageUrl: input.meterImageUrl ?? null,
      startMeterLogId: input.startMeterLogId ?? null,
      endMeterLogId: input.endMeterLogId ?? null,
      billStatus: 'pending',
      updatedAt: new Date(),
    })
    .where(eq(electricityBills.id, result.billId));

  return { ok: true, billId: result.billId };
}

export async function getPgMeterRooms(session: AdminSession, pgId: string) {
  assertPgAccess(session, pgId);
  return db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(floors.pgId, pgId), isNull(rooms.archivedAt)))
    .orderBy(floors.floorNumber, rooms.roomNumber);
}

export async function getRoomMeterSummary(roomId: string) {
  const [roomRow] = await db
    .select({
      prepaidCreditPaise: rooms.electricityPrepaidCreditPaise,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  const logs = await db
    .select()
    .from(meterLogs)
    .where(eq(meterLogs.roomId, roomId))
    .orderBy(desc(meterLogs.recordedAt))
    .limit(5);

  const [latestBill] = await db
    .select()
    .from(electricityBills)
    .where(eq(electricityBills.roomId, roomId))
    .orderBy(desc(electricityBills.billingMonth))
    .limit(1);

  const prepaidLedger = await db
    .select()
    .from(roomElectricityPrepaidLedger)
    .where(eq(roomElectricityPrepaidLedger.roomId, roomId))
    .orderBy(desc(roomElectricityPrepaidLedger.createdAt))
    .limit(3);

  return {
    logs,
    latestBill,
    prepaidCreditPaise: roomRow?.prepaidCreditPaise ?? 0,
    prepaidLedger,
  };
}

/** Active days in billing month for a booking's beds in a room (pro-rata weight). */
export async function activeDaysInRoomForMonth(
  bookingId: string,
  roomId: string,
  billingMonth: string,
): Promise<number> {
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const rows = await db
    .select({
      lower: sql<string>`lower(bed_reservations.stay_range)::text`,
      upper: sql<string>`upper(bed_reservations.stay_range)::text`,
    })
    .from(bookings)
    .innerJoin(sql`bed_reservations`, sql`bed_reservations.booking_id = ${bookings.id}`)
    .innerJoin(beds, sql`${beds.id} = bed_reservations.bed_id`)
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(beds.roomId, roomId),
        sql`bed_reservations.status IN ('hold','active')`,
        sql`bed_reservations.stay_range && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    );

  let totalDays = 0;
  for (const row of rows) {
    const aStart = parseDate(row.lower);
    const aEnd = row.upper ? parseDate(row.upper) : monthEnd;
    const intersectStart = aStart > monthStart ? aStart : monthStart;
    const intersectEnd = aEnd < monthEnd ? aEnd : monthEnd;
    if (intersectEnd > intersectStart) {
      totalDays += diffDays(intersectStart, intersectEnd);
    }
  }
  return totalDays;
}

export async function getPgMeterSummaries(session: AdminSession, pgId: string) {
  const rooms = await getPgMeterRooms(session, pgId);
  return Promise.all(
    rooms.map(async (room) => ({
      ...room,
      ...(await getRoomMeterSummary(room.roomId)),
    })),
  );
}

export async function createEstimatedMonthlyBill(
  session: AdminSession,
  input: {
    roomId: string;
    billingMonth: string;
    ratePerUnitPaise: number;
  },
): Promise<{ ok: true; billId: string } | { ok: false; message: string }> {
  const estimatedUnits = await estimateMonthlyUnits(input.roomId, input.billingMonth);
  if (estimatedUnits <= 0) {
    return { ok: false, message: 'No historical usage to estimate from.' };
  }

  const [roomRow] = await db
    .select({ floorId: rooms.floorId })
    .from(rooms)
    .where(eq(rooms.id, input.roomId))
    .limit(1);
  if (!roomRow) return { ok: false, message: 'Room not found.' };

  const [floor] = await db
    .select({ pgId: floors.pgId })
    .from(floors)
    .where(eq(floors.id, roomRow.floorId))
    .limit(1);
  if (!floor) return { ok: false, message: 'Room not found.' };
  assertPgAccess(session, floor.pgId);

  const [prevLog] = await db
    .select()
    .from(meterLogs)
    .where(eq(meterLogs.roomId, input.roomId))
    .orderBy(desc(meterLogs.recordedAt))
    .limit(1);

  const previous = prevLog ? Number(prevLog.units) : 0;
  const current = previous + estimatedUnits;
  const recordedAt = formatDate(new Date());

  const [estLog] = await db
    .insert(meterLogs)
    .values({
      pgId: floor.pgId as string,
      roomId: input.roomId,
      readingType: 'monthly',
      units: current.toString(),
      recordedBy: 'system',
      recordedById: session.adminId,
      isEstimated: true,
      recordedAt,
      notes: `Estimated ${estimatedUnits} units from historical average`,
    })
    .returning({ id: meterLogs.id });

  return createBillFromMeterLogs(session, {
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    ratePerUnitPaise: input.ratePerUnitPaise,
    endMeterLogId: estLog.id,
    startMeterLogId: prevLog?.id,
    isEstimated: true,
    previousReadingUnits: previous,
    currentReadingUnits: current,
  });
}

export async function getRoomElectricityForCustomer(
  customerId: string,
  roomId: string,
) {
  const [access] = await db
    .select({ bookingId: bookings.id })
    .from(bookings)
    .innerJoin(sql`bed_reservations`, sql`bed_reservations.booking_id = ${bookings.id}`)
    .innerJoin(beds, sql`${beds.id} = bed_reservations.bed_id`)
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, 'confirmed'),
        eq(beds.roomId, roomId),
        sql`bed_reservations.status IN ('hold','active')`,
      ),
    )
    .limit(1);
  if (!access) return null;

  const [latestBill] = await db
    .select()
    .from(electricityBills)
    .where(eq(electricityBills.roomId, roomId))
    .orderBy(desc(electricityBills.billingMonth))
    .limit(1);

  const invoices = latestBill
    ? await db
        .select({
          id: electricityInvoices.id,
          invoiceNumber: electricityInvoices.invoiceNumber,
          customerId: electricityInvoices.customerId,
          amountPaise: electricityInvoices.amountPaise,
          unitsShare: electricityInvoices.unitsShare,
          activeDays: electricityInvoices.activeDays,
          status: electricityInvoices.status,
          paymentProofUrl: electricityInvoices.paymentProofUrl,
          paidPaise: electricityInvoices.paidPaise,
        })
        .from(electricityInvoices)
        .where(eq(electricityInvoices.electricityBillId, latestBill.id))
    : [];

  const logs = await db
    .select()
    .from(meterLogs)
    .where(eq(meterLogs.roomId, roomId))
    .orderBy(desc(meterLogs.recordedAt))
    .limit(3);

  return { latestBill, invoices, logs, bookingId: access.bookingId };
}

export async function submitElectricityPaymentProof(
  customerId: string,
  invoiceId: string,
  paymentProofUrl: string,
  transactionRef?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const invoice = await fetchElectricityInvoiceById(invoiceId);
  if (!invoice || invoice.customerId !== customerId) {
    return { ok: false, message: 'Invoice not found.' };
  }
  if (invoice.status !== 'pending') {
    return { ok: false, message: 'This invoice is not awaiting payment.' };
  }
  if (!paymentProofUrl.trim()) {
    return { ok: false, message: 'Payment screenshot is required.' };
  }

  await db
    .update(electricityInvoices)
    .set({
      paymentProofUrl: paymentProofUrl.trim(),
      updatedAt: new Date(),
    })
    .where(eq(electricityInvoices.id, invoiceId));

  const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
  const [pgRow] = await db
    .select({ pgId: electricityBills.pgId })
    .from(electricityBills)
    .where(eq(electricityBills.id, invoice.electricityBillId))
    .limit(1);
  await linkResidentUpload({
    storagePath: paymentProofUrl.trim(),
    adminQueue: 'collections',
    linkedEntity: 'electricity_invoice',
    linkedEntityId: invoiceId,
    bookingId: invoice.bookingId,
    pgId: pgRow?.pgId ?? null,
  }).catch(() => undefined);

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

  const { syncElectricityInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
  await syncElectricityInvoiceToUnified(invoiceId);

  const { supersedeActiveRejection } = await import('@/src/services/paymentProofRejectionService');
  await supersedeActiveRejection('electricity_invoice', invoiceId);

  return { ok: true };
}

export async function listPendingElectricityProofsForPg(pgId: string) {
  return db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      roomNumber: rooms.roomNumber,
      amountPaise: electricityInvoices.amountPaise,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(
      and(
        eq(electricityBills.pgId, pgId),
        eq(electricityInvoices.status, 'pending'),
        sql`${electricityInvoices.paymentProofUrl} IS NOT NULL`,
      ),
    )
    .orderBy(desc(electricityInvoices.updatedAt));
}

export async function approveElectricityPaymentProof(
  session: AdminSession,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const invoice = await fetchElectricityInvoiceById(invoiceId);
  if (!invoice) return { ok: false, message: 'Invoice not found.' };
  if (!invoice.paymentProofUrl) {
    return { ok: false, message: 'No payment proof uploaded.' };
  }
  if (invoice.status !== 'pending') {
    return { ok: false, message: 'Invoice is not pending.' };
  }

  const projected = projectElectricityInvoice(invoice);
  const refundPaise = projected.outstandingPaise;

  const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');
  const result = await applyApprovedPaymentAtomic({
    purpose: 'electricity',
    provider: 'mock',
    providerPaymentId: `qr-proof-${invoiceId}`,
    amountPaise: refundPaise,
    invoiceId,
    offlineProvider: 'upi_manual',
    rawPayload: { source: 'qr_payment_proof', proofUrl: invoice.paymentProofUrl },
  });

  if (result.ok) return { ok: true };

  const refreshed = await fetchElectricityInvoiceById(invoiceId);
  if (refreshed?.status === 'paid') {
    return { ok: true };
  }

  return { ok: false, message: result.reason };
}

export async function rejectElectricityPaymentProof(
  session: AdminSession,
  invoiceId: string,
  rejection: {
    reviewKey: string;
    reasonCode: import('@/src/lib/approvals/paymentProofRejectionReasons').PaymentProofRejectionReasonCode;
    reasonDetail?: string;
    adminNote?: string;
    residentMessage: string;
    sendWhatsApp: boolean;
  },
): Promise<{ ok: true; whatsappUrl?: string } | { ok: false; message: string }> {
  const { rejectPaymentProof } = await import('@/src/services/paymentProofRejectionService');
  return rejectPaymentProof(session, {
    reviewKey: rejection.reviewKey,
    entityType: 'electricity_invoice',
    entityId: invoiceId,
    reasonCode: rejection.reasonCode,
    reasonDetail: rejection.reasonDetail,
    adminNote: rejection.adminNote,
    residentMessage: rejection.residentMessage,
    sendWhatsApp: rejection.sendWhatsApp,
  });
}
