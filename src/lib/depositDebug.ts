/** Temporary structured logging for deposit wallet save/reload investigations. */

export type DepositDebugSnapshot = {
  bookingId?: string | null;
  residentId?: string | null;
  actionName?: string;
  requiredDeposit?: unknown;
  collectedDeposit?: unknown;
  wallet?: unknown;
  ledger?: unknown;
  phase?: string;
  error?: unknown;
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }
  return error;
}

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function logDepositDebug(snapshot: DepositDebugSnapshot) {
  const payload = {
    ...snapshot,
    error: snapshot.error != null ? serializeError(snapshot.error) : undefined,
  };
  try {
    JSON.stringify(payload, jsonReplacer);
  } catch (serializeErr) {
    console.error('[DEPOSIT_DEBUG] payload not JSON-safe', {
      phase: snapshot.phase,
      bookingId: snapshot.bookingId,
      serializeErr,
    });
  }
  console.error('[DEPOSIT_DEBUG]', payload);
}
