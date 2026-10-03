/** Pure rules for cross-room transfer meter evidence (no DB). */

export function isCrossRoomBedTransfer(fromRoomId: string, toRoomId: string): boolean {
  return fromRoomId !== toRoomId;
}

export type TransferMeterSubmissionInput = {
  isCrossRoom: boolean;
  readingUnits: number | null | undefined;
  meterImageUrl: string | null | undefined;
};

export function validateTransferMeterSubmission(
  input: TransferMeterSubmissionInput,
): { ok: true } | { ok: false; message: string } {
  if (!input.isCrossRoom) {
    return { ok: true };
  }
  if (input.readingUnits == null || !Number.isFinite(input.readingUnits)) {
    return { ok: false, message: 'Old room meter reading is required before changing rooms.' };
  }
  if (input.readingUnits < 0) {
    return { ok: false, message: 'Meter reading cannot be negative.' };
  }
  const photo = input.meterImageUrl?.trim();
  if (!photo) {
    return { ok: false, message: 'Meter photo is required before changing rooms.' };
  }
  return { ok: true };
}

export function validateTransferReadingAgainstBaseline(input: {
  readingUnits: number;
  baselineUnits: number;
}): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(input.readingUnits) || input.readingUnits < 0) {
    return { ok: false, message: 'Meter reading cannot be negative.' };
  }
  if (input.readingUnits < input.baselineUnits) {
    return {
      ok: false,
      message: `Meter reading must be at least ${input.baselineUnits} (last finalized room reading).`,
    };
  }
  return { ok: true };
}

export const ROOM_TRANSFER_METER_NOTE_PREFIX = 'room_transfer:';

export function buildRoomTransferMeterLogNote(requestId: string): string {
  return `${ROOM_TRANSFER_METER_NOTE_PREFIX}${requestId}`;
}

export function adminMeterLogImageUrl(meterLogId: string): string {
  return `/api/admin/meter-log/${meterLogId}/image`;
}
