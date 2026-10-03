/**
 * Cross-room bed transfer — old-room meter evidence (reading + photo).
 * Same-room bed changes do not use this path.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  floors,
  meterLogs,
  roomChangeRequests,
  rooms,
} from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import {
  adminMeterLogImageUrl,
  buildRoomTransferMeterLogNote,
  isCrossRoomBedTransfer,
  validateTransferMeterSubmission,
  validateTransferReadingAgainstBaseline,
} from '@/src/lib/roomTransfer/roomChangeTransferMeterEvidencePure';
import { roomChangeTransferMeterSchemaReady } from '@/src/lib/roomTransfer/roomChangeTransferMeterSchema';

export {
  adminMeterLogImageUrl,
  isCrossRoomBedTransfer,
  validateTransferMeterSubmission,
  validateTransferReadingAgainstBaseline,
} from '@/src/lib/roomTransfer/roomChangeTransferMeterEvidencePure';

export type BedRoomContext = {
  bedId: string;
  roomId: string;
  roomNumber: string;
  bedCode: string;
};

export async function loadBedRoomContext(bedId: string): Promise<BedRoomContext | null> {
  const [row] = await db
    .select({
      bedId: beds.id,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(beds)
    .innerJoin(rooms, eq(beds.roomId, rooms.id))
    .where(eq(beds.id, bedId))
    .limit(1);
  return row ?? null;
}

export async function crossRoomTransferRequired(
  fromBedId: string,
  toBedId: string,
): Promise<boolean> {
  const [from, to] = await Promise.all([
    loadBedRoomContext(fromBedId),
    loadBedRoomContext(toBedId),
  ]);
  if (!from || !to) return false;
  return isCrossRoomBedTransfer(from.roomId, to.roomId);
}

export type RoomChangeTransferMeterGateResult =
  | { ok: true; required: false }
  | { ok: true; required: true; satisfied: boolean; transferMeterLogId: string | null }
  | { ok: false; message: string };

export async function assessRoomChangeTransferMeterGate(input: {
  fromBedId: string;
  toBedId: string;
  transferMeterLogId?: string | null;
  skipTransferMeterEvidence?: boolean;
}): Promise<RoomChangeTransferMeterGateResult> {
  if (input.skipTransferMeterEvidence) {
    return { ok: true, required: false };
  }
  const required = await crossRoomTransferRequired(input.fromBedId, input.toBedId);
  if (!required) {
    return { ok: true, required: false };
  }
  const schemaReady = await roomChangeTransferMeterSchemaReady();
  if (!schemaReady) {
    return {
      ok: false,
      message: 'Room-change meter evidence is not available yet — try again shortly.',
    };
  }
  const logId = input.transferMeterLogId ?? null;
  return { ok: true, required: true, satisfied: Boolean(logId), transferMeterLogId: logId };
}

export async function assertTransferMeterEvidenceForBedMove(input: {
  fromBedId: string;
  toBedId: string;
  transferMeterLogId?: string | null;
  skipTransferMeterEvidence?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const gate = await assessRoomChangeTransferMeterGate(input);
  if (!gate.ok) return gate;
  if (!gate.required) return { ok: true };
  if (gate.satisfied) return { ok: true };
  return {
    ok: false,
    message:
      'Meter reading required before changing rooms. Upload your current room meter photo and reading.',
  };
}

export async function submitRoomChangeTransferMeterEvidence(input: {
  requestId: string;
  customerId: string;
  readingUnits: number;
  meterImageUrl: string;
  recordedAt?: string;
}): Promise<
  | {
      ok: true;
      meterLogId: string;
      idempotent: boolean;
      completionOk: boolean;
      completionMessage?: string;
    }
  | { ok: false; message: string }
> {
  const schemaReady = await roomChangeTransferMeterSchemaReady();
  if (!schemaReady) {
    return { ok: false, message: 'Room-change meter evidence is not available yet.' };
  }

  const validation = validateTransferMeterSubmission({
    isCrossRoom: true,
    readingUnits: input.readingUnits,
    meterImageUrl: input.meterImageUrl,
  });
  if (!validation.ok) return validation;

  const [request] = await db
    .select()
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, input.requestId))
    .limit(1);
  if (!request || request.customerId !== input.customerId) {
    return { ok: false, message: 'Room change request not found.' };
  }
  if (request.workflowState === 'COMPLETED' || request.status === 'completed') {
    if (request.transferMeterLogId) {
      return {
        ok: true,
        meterLogId: request.transferMeterLogId,
        idempotent: true,
        completionOk: true,
      };
    }
    return { ok: false, message: 'This room change is already complete.' };
  }
  if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(request.workflowState)) {
    return { ok: false, message: 'This room change is no longer active.' };
  }

  const crossRoom = await crossRoomTransferRequired(request.fromBedId, request.toBedId);
  if (!crossRoom) {
    return { ok: false, message: 'Meter evidence is not required for a same-room bed change.' };
  }

  const [activeStay] = await db
    .select({ bedId: bedReservations.bedId })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, request.bookingId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);
  if (!activeStay || activeStay.bedId !== request.fromBedId) {
    return {
      ok: false,
      message: 'You can only submit a meter reading for your current room assignment.',
    };
  }

  if (request.transferMeterLogId) {
    const [existing] = await db
      .select({ id: meterLogs.id, units: meterLogs.units })
      .from(meterLogs)
      .where(eq(meterLogs.id, request.transferMeterLogId))
      .limit(1);
    if (existing && Number(existing.units) === input.readingUnits) {
      return {
        ok: true,
        meterLogId: existing.id,
        idempotent: true,
        completionOk: true,
      };
    }
    return { ok: false, message: 'Transfer meter evidence was already submitted for this request.' };
  }

  const fromCtx = await loadBedRoomContext(request.fromBedId);
  if (!fromCtx) return { ok: false, message: 'Current room not found.' };

  const transferDate =
    request.expectedTransferDate ?? request.requestedShiftDate ?? formatDate(new Date());
  const baseline = await resolveRoomPreviousMeterReading(fromCtx.roomId, {
    beforeBillingMonth: firstOfMonth(transferDate),
  });
  const baselineCheck = validateTransferReadingAgainstBaseline({
    readingUnits: input.readingUnits,
    baselineUnits: baseline.previousReadingUnits,
  });
  if (!baselineCheck.ok) return baselineCheck;

  const [fromPg] = await db
    .select({ pgId: floors.pgId })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(beds.id, request.fromBedId))
    .limit(1);
  if (!fromPg) return { ok: false, message: 'Could not resolve property for meter log.' };

  const recordedAt = input.recordedAt ?? formatDate(new Date());
  const note = buildRoomTransferMeterLogNote(request.id);

  let meterLogId = '';
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM room_change_requests WHERE id = ${request.id}::uuid FOR UPDATE`);
    const [locked] = await tx
      .select({ transferMeterLogId: roomChangeRequests.transferMeterLogId })
      .from(roomChangeRequests)
      .where(eq(roomChangeRequests.id, request.id))
      .limit(1);
    if (locked?.transferMeterLogId) {
      meterLogId = locked.transferMeterLogId;
      return;
    }

    const [log] = await tx
      .insert(meterLogs)
      .values({
        pgId: fromPg.pgId,
        roomId: fromCtx.roomId,
        bookingId: request.bookingId,
        readingType: 'room_transfer',
        units: input.readingUnits.toString(),
        meterImageUrl: input.meterImageUrl.trim(),
        recordedBy: 'tenant',
        recordedById: input.customerId,
        recordedAt,
        notes: note,
      })
      .returning({ id: meterLogs.id });
    meterLogId = log.id;

    await tx
      .update(roomChangeRequests)
      .set({
        transferMeterLogId: meterLogId,
        updatedAt: new Date(),
      })
      .where(eq(roomChangeRequests.id, request.id));

    await tx.insert(auditLog).values({
      actorType: 'customer',
      actorId: input.customerId,
      entity: 'room_change_request',
      entityId: request.id,
      action: 'transfer_meter_evidence_submitted',
      diff: {
        meterLogId,
        roomId: fromCtx.roomId,
        fromBedId: request.fromBedId,
        toBedId: request.toBedId,
        readingUnits: input.readingUnits,
        recordedAt,
      },
    });
  });

  if (!meterLogId) {
    return { ok: false, message: 'Could not save meter evidence.' };
  }

  const { tryCompleteRoomChangeRequest } = await import('@/src/services/roomTransferLifecycle');
  const completion = await tryCompleteRoomChangeRequest(request.id);

  return {
    ok: true,
    meterLogId,
    idempotent: false,
    completionOk: completion.ok,
    completionMessage: completion.ok ? undefined : completion.message,
  };
}

export type RoomTransferMeterEvidencePreview = {
  roomChangeRequestId: string;
  customerId: string;
  customerName: string;
  fromRoomLabel: string;
  fromBedCode: string;
  transferDate: string;
  occupancyStart: string | null;
  occupancyEnd: string;
  previousFinalizedReadingUnits: number | null;
  transferReadingUnits: number;
  meterLogId: string;
  meterPhotoViewUrl: string | null;
};

export async function loadRoomTransferMeterEvidenceForRoomMonth(input: {
  roomId: string;
  billingMonth: string;
}): Promise<RoomTransferMeterEvidencePreview[]> {
  const schemaReady = await roomChangeTransferMeterSchemaReady();
  if (!schemaReady) return [];

  const monthStart = firstOfMonth(input.billingMonth);
  const evidenceRows = await db.execute<{
    request_id: string;
    customer_id: string;
    customer_name: string;
    transfer_date: string;
    meter_log_id: string;
    transfer_units: string;
    from_bed_code: string;
    from_room_number: string;
    booking_id: string;
  }>(sql`
    SELECT rcr.id AS request_id,
           rcr.customer_id,
           c.full_name AS customer_name,
           coalesce(rcr.expected_transfer_date, rcr.requested_shift_date) AS transfer_date,
           rcr.transfer_meter_log_id AS meter_log_id,
           ml.units AS transfer_units,
           fb.bed_code AS from_bed_code,
           fr.room_number AS from_room_number,
           rcr.booking_id
    FROM room_change_requests rcr
    INNER JOIN customers c ON c.id = rcr.customer_id
    INNER JOIN meter_logs ml ON ml.id = rcr.transfer_meter_log_id
    INNER JOIN beds fb ON fb.id = rcr.from_bed_id
    INNER JOIN rooms fr ON fr.id = fb.room_id
    WHERE rcr.status = 'completed'
      AND fr.id = ${input.roomId}::uuid
      AND rcr.transfer_meter_log_id IS NOT NULL
      AND date_trunc('month', coalesce(rcr.expected_transfer_date, rcr.requested_shift_date)::date)::date
          = ${monthStart}::date
  `);

  const previews: RoomTransferMeterEvidencePreview[] = [];
  for (const row of evidenceRows) {
    const baseline = await resolveRoomPreviousMeterReading(input.roomId, {
      beforeBillingMonth: firstOfMonth(row.transfer_date),
    });

    const [stay] = await db
      .select({
        startDate: sql<string>`lower(${bedReservations.stayRange})::text`,
      })
      .from(bedReservations)
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .where(
        and(
          eq(bedReservations.bookingId, row.booking_id),
          eq(beds.roomId, input.roomId),
          eq(bedReservations.kind, 'primary'),
          inArray(bedReservations.status, ['active', 'completed']),
        ),
      )
      .orderBy(asc(sql`lower(${bedReservations.stayRange})`))
      .limit(1);

    previews.push({
      roomChangeRequestId: row.request_id,
      customerId: row.customer_id,
      customerName: row.customer_name ?? 'Resident',
      fromRoomLabel: `Room ${row.from_room_number}`,
      fromBedCode: row.from_bed_code,
      transferDate: row.transfer_date,
      occupancyStart: stay?.startDate ?? null,
      occupancyEnd: row.transfer_date,
      previousFinalizedReadingUnits: baseline.previousReadingUnits,
      transferReadingUnits: Number(row.transfer_units),
      meterLogId: row.meter_log_id,
      meterPhotoViewUrl: adminMeterLogImageUrl(row.meter_log_id),
    });
  }

  return previews;
}
