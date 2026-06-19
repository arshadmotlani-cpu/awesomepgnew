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

export function logDepositDebug(snapshot: DepositDebugSnapshot) {
  const payload = {
    ...snapshot,
    error: snapshot.error != null ? serializeError(snapshot.error) : undefined,
  };
  if (snapshot.error != null) {
    console.error('[DEPOSIT_DEBUG]', payload);
  } else {
    console.error('[DEPOSIT_DEBUG]', payload);
  }
}
