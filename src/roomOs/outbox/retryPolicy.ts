/**
 * Outbox retry policy — Wave 2 operational infrastructure.
 */

export const ROOM_OS_OUTBOX_MAX_ATTEMPTS = 5;

/** Backoff after attempts 1–4 (ms). Attempt 5 is permanent fail. */
export const ROOM_OS_OUTBOX_RETRY_BACKOFF_MS = [60_000, 300_000, 900_000, 900_000] as const;

export function computeRoomOsOutboxRetryDelayMs(attemptCount: number): number {
  const index = Math.max(0, Math.min(attemptCount - 1, ROOM_OS_OUTBOX_RETRY_BACKOFF_MS.length - 1));
  return ROOM_OS_OUTBOX_RETRY_BACKOFF_MS[index] ?? 900_000;
}

export function isRoomOsOutboxDeadLetter(attemptCount: number): boolean {
  return attemptCount >= ROOM_OS_OUTBOX_MAX_ATTEMPTS;
}
