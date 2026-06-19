'use client';

import { useActionState } from 'react';
import {
  editDepositSummaryAction,
  type DepositWalletActionState,
} from '@/app/(admin)/admin/deposits/deposit-wallet-actions';
import {
  sanitizeUnifiedDepositView,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { asPlainNumber } from '@/src/lib/format';

console.error('[CORRECT_FORM_MODULE_0]', {
  phase: 'imports_loaded',
  file: 'src/components/admin/deposits/DepositCorrectForm.tsx',
  editDepositSummaryActionType: typeof editDepositSummaryAction,
  sanitizeType: typeof sanitizeUnifiedDepositView,
  asPlainNumberType: typeof asPlainNumber,
});

const idle: DepositWalletActionState = { status: 'idle' };

console.error('[CORRECT_FORM_MODULE_1]', {
  phase: 'module_init_complete',
  idleStatus: idle.status,
});

function forensicFail(line: number, expression: string, error: unknown, extra?: Record<string, unknown>): never {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error('[DEPOSIT_CORRECT_FORM_FORENSIC]', {
    status: 'fail',
    line,
    expression,
    message: err.message,
    stack: err.stack,
    ...extra,
  });
  throw error;
}

function forensicOk(line: number, expression: string, extra?: Record<string, unknown>) {
  console.error('[DEPOSIT_CORRECT_FORM_FORENSIC]', {
    status: 'ok',
    line,
    expression,
    ...extra,
  });
}

function runtimeType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return 'bigint';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function previewValue(value: unknown): string {
  try {
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'object' && value !== null) return JSON.stringify(value);
    return String(value);
  } catch {
    return '[unstringifiable]';
  }
}

function inspectViewProp(view: unknown): Record<string, string> {
  if (!view || typeof view !== 'object') {
    return { _root: runtimeType(view) };
  }
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(view as Record<string, unknown>)) {
    out[key] = runtimeType(val);
  }
  return out;
}

/** Full implementation + per-line forensic try/catch (production investigation). */
export function DepositCorrectForm({ view }: { view: UnifiedDepositView }) {
  console.error('[CORRECT_FORM_RENDER]', {
    phase: 'render_enter',
    component: 'DepositCorrectForm',
    forensic: true,
  });

  let v: UnifiedDepositView;
  try {
    forensicOk(16, 'inspect incoming view prop', {
      viewType: runtimeType(view),
      viewFieldTypes: inspectViewProp(view),
      requiredPaiseType: runtimeType((view as UnifiedDepositView | null)?.requiredPaise),
      requiredPaiseValue: previewValue((view as UnifiedDepositView | null)?.requiredPaise),
      collectedPaiseType: runtimeType((view as UnifiedDepositView | null)?.collectedPaise),
      collectedPaiseValue: previewValue((view as UnifiedDepositView | null)?.collectedPaise),
    });
  } catch (error) {
    forensicFail(16, 'inspect incoming view prop', error);
  }

  try {
    v = sanitizeUnifiedDepositView(view);
    forensicOk(17, 'sanitizeUnifiedDepositView(view)', {
      bookingId: v.bookingId,
      requiredPaiseType: runtimeType(v.requiredPaise),
      requiredPaiseValue: previewValue(v.requiredPaise),
      collectedPaiseType: runtimeType(v.collectedPaise),
      collectedPaiseValue: previewValue(v.collectedPaise),
    });
  } catch (error) {
    forensicFail(17, 'sanitizeUnifiedDepositView(view)', error, {
      viewType: runtimeType(view),
    });
  }

  let state: DepositWalletActionState;
  let action: (payload: FormData) => void;
  let pending: boolean;
  try {
    [state, action, pending] = useActionState(editDepositSummaryAction, idle);
    forensicOk(18, 'useActionState(editDepositSummaryAction, idle)', {
      stateStatus: state.status,
      actionType: runtimeType(action),
      pendingType: runtimeType(pending),
      pendingValue: previewValue(pending),
    });
  } catch (error) {
    forensicFail(18, 'useActionState(editDepositSummaryAction, idle)', error, {
      editDepositSummaryActionType: typeof editDepositSummaryAction,
    });
  }

  let requiredPlaceholder: string;
  try {
    const requiredPaisePlain = asPlainNumber(v.requiredPaise);
    forensicOk(20, 'asPlainNumber(v.requiredPaise)', {
      inType: runtimeType(v.requiredPaise),
      inValue: previewValue(v.requiredPaise),
      outType: runtimeType(requiredPaisePlain),
      outValue: previewValue(requiredPaisePlain),
    });
    requiredPlaceholder = (requiredPaisePlain / 100).toString();
    forensicOk(20, 'requiredPlaceholder = (asPlainNumber(v.requiredPaise) / 100).toString()', {
      requiredPlaceholder,
    });
  } catch (error) {
    forensicFail(20, 'requiredPlaceholder = (asPlainNumber(v.requiredPaise) / 100).toString()', error, {
      requiredPaiseType: runtimeType(v.requiredPaise),
      requiredPaiseValue: previewValue(v.requiredPaise),
    });
  }

  let collectedPlaceholder: string;
  try {
    const collectedPaisePlain = asPlainNumber(v.collectedPaise);
    forensicOk(21, 'asPlainNumber(v.collectedPaise)', {
      inType: runtimeType(v.collectedPaise),
      inValue: previewValue(v.collectedPaise),
      outType: runtimeType(collectedPaisePlain),
      outValue: previewValue(collectedPaisePlain),
    });
    collectedPlaceholder = (collectedPaisePlain / 100).toString();
    forensicOk(21, 'collectedPlaceholder = (asPlainNumber(v.collectedPaise) / 100).toString()', {
      collectedPlaceholder,
    });
  } catch (error) {
    forensicFail(21, 'collectedPlaceholder = (asPlainNumber(v.collectedPaise) / 100).toString()', error, {
      collectedPaiseType: runtimeType(v.collectedPaise),
      collectedPaiseValue: previewValue(v.collectedPaise),
    });
  }

  try {
    forensicOk(23, 'JSX return start', {
      bookingId: v.bookingId,
      requiredPlaceholder,
      collectedPlaceholder,
      stateStatus: state.status,
    });
    console.error('[CORRECT_FORM_RENDER]', {
      phase: 'render_jsx',
      component: 'DepositCorrectForm',
    });

    return (
      <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="text-sm font-semibold text-white">Correct deposit</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Update the required or collected deposit amount when records need fixing.
        </p>

        <form
          action={action}
          className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-4 sm:grid-cols-2"
        >
          <input type="hidden" name="bookingId" value={v.bookingId} />
          <label className="text-sm">
            <span className="text-apg-silver">Required deposit (₹)</span>
            <input
              name="requiredInr"
              type="number"
              min="0"
              step="1"
              placeholder={requiredPlaceholder}
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-apg-silver">Collected deposit (₹)</span>
            <input
              name="collectedInr"
              type="number"
              min="0"
              step="1"
              placeholder={collectedPlaceholder}
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
            />
          </label>
          <label className="sm:col-span-2 text-sm">
            <span className="text-apg-silver">Reason</span>
            <input
              name="reason"
              required
              placeholder="Why are you correcting this deposit?"
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save corrections'}
            </button>
            {state.status === 'ok' ? (
              <p className="mt-2 text-xs text-emerald-300">{state.message}</p>
            ) : null}
            {state.status === 'error' ? (
              <p className="mt-2 text-xs text-rose-300">{state.message}</p>
            ) : null}
          </div>
        </form>
      </section>
    );
  } catch (error) {
    forensicFail(23, 'JSX return', error);
  }
}
