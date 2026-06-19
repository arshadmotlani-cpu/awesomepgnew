/**
 * Post-save deposit wallet state tracing — production investigation for E352 reload crash.
 */

import { jsonSafe } from '@/src/lib/depositPageDebug';
import type { UnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';

export const UNIFIED_VIEW_PAISE_FIELDS = [
  'requiredPaise',
  'collectedPaise',
  'refundablePaise',
  'deductedPaise',
  'refundedPaise',
  'depositDuePaise',
] as const;

export type PaiseFieldInspection = {
  typeof: string;
  value: string;
  isFinite: boolean;
};

export function inspectPaiseValue(value: unknown): PaiseFieldInspection {
  const typeofVal = value === null ? 'null' : typeof value;
  let display: string;
  if (typeof value === 'bigint') display = `${value}n`;
  else if (value === undefined) display = 'undefined';
  else if (typeof value === 'object') {
    try {
      display = JSON.stringify(value);
    } catch {
      display = String(value);
    }
  } else {
    display = String(value);
  }

  const asNumber =
    typeof value === 'number'
      ? value
      : typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string'
          ? Number(value)
          : NaN;

  return {
    typeof: typeofVal,
    value: display,
    isFinite: Number.isFinite(asNumber),
  };
}

export function inspectUnifiedDepositViewFields(
  view: UnifiedDepositView | null | undefined,
): Record<string, PaiseFieldInspection> | null {
  if (!view) return null;
  const fields: Record<string, PaiseFieldInspection> = {};
  for (const key of UNIFIED_VIEW_PAISE_FIELDS) {
    fields[key] = inspectPaiseValue(view[key]);
  }
  return fields;
}

export type WalletPropsPayload = {
  view: UnifiedDepositView;
  isFrozen: boolean;
};

export function inspectWalletProps(walletProps: WalletPropsPayload | null | undefined): {
  payload: ReturnType<typeof jsonSafe<WalletPropsPayload | null>>;
  viewFieldTypes: Record<string, PaiseFieldInspection> | null;
  isFrozen: PaiseFieldInspection | null;
  jsonSerializable: boolean;
  jsonError: string | null;
} {
  if (!walletProps) {
    return {
      payload: null,
      viewFieldTypes: null,
      isFrozen: null,
      jsonSerializable: true,
      jsonError: null,
    };
  }

  let jsonSerializable = true;
  let jsonError: string | null = null;
  try {
    JSON.stringify(walletProps);
  } catch (err) {
    jsonSerializable = false;
    jsonError = err instanceof Error ? err.message : String(err);
  }

  return {
    payload: jsonSafe(walletProps) as WalletPropsPayload,
    viewFieldTypes: inspectUnifiedDepositViewFields(walletProps.view),
    isFrozen: inspectPaiseValue(walletProps.isFrozen),
    jsonSerializable,
    jsonError,
  };
}

/** Emit [POST_SAVE_WALLET_STATE] to Vercel logs. */
export function logPostSaveWalletState(
  checkpoint: string,
  bookingId: string,
  extra?: Record<string, unknown>,
): void {
  console.error(
    '[POST_SAVE_WALLET_STATE]',
    jsonSafe({
      checkpoint,
      bookingId,
      ts: Date.now(),
      ...extra,
    }),
  );
}

export function logUnifiedDepositViewAtCheckpoint(
  checkpoint: string,
  bookingId: string,
  view: UnifiedDepositView | null | undefined,
  extra?: Record<string, unknown>,
): void {
  logPostSaveWalletState(checkpoint, bookingId, {
    unifiedView: view ? jsonSafe(view) : null,
    paiseFieldTypes: inspectUnifiedDepositViewFields(view),
    ...extra,
  });
}

export function logWalletPropsAtCheckpoint(
  checkpoint: string,
  bookingId: string,
  walletProps: WalletPropsPayload | null | undefined,
  extra?: Record<string, unknown>,
): void {
  const inspected = inspectWalletProps(walletProps);
  logPostSaveWalletState(checkpoint, bookingId, {
    walletProps: inspected.payload,
    paiseFieldTypes: inspected.viewFieldTypes,
    isFrozen: inspected.isFrozen,
    jsonSerializable: inspected.jsonSerializable,
    jsonError: inspected.jsonError,
    ...extra,
  });
}
