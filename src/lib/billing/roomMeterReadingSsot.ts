/**
 * Pure helpers for continuous room meter SSOT.
 * Room previous reading advances ONLY when a monthly electricity bill is finalized.
 * Move-out settlements never contribute to this chain.
 */

export type RoomPreviousMeterSource =
  | 'last_monthly_bill'
  | 'last_monthly_meter_log'
  | 'none';

export function readingsMatch(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.round(a * 100) === Math.round(b * 100);
}

export function validateContinuousPreviousReading(input: {
  providedPreviousUnits: number;
  expectedPreviousUnits: number;
  allowOverride?: boolean;
}): { ok: true } | { ok: false; message: string } {
  if (input.allowOverride) return { ok: true };
  if (readingsMatch(input.providedPreviousUnits, input.expectedPreviousUnits)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `Previous meter reading must be ${input.expectedPreviousUnits} ` +
      `(last finalized monthly reading for this room). ` +
      `Got ${input.providedPreviousUnits}. ` +
      `Move-out settlements do not change the room previous reading.`,
  };
}
