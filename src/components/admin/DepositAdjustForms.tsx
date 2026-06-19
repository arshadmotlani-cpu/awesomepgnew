'use client';

/**
 * ADJUST BISECT PHASE 2 — CorrectDepositForm (paiseToInr + defaultValue path).
 * Phase 3 will add add/deduct/refund grid. Archive: DepositAdjustForms.full.tsx
 */

import { useActionState } from 'react';
import {
  correctDepositAction,
  initialActionState,
} from '@/app/(admin)/admin/deposits/[bookingId]/actions';
import { paiseToInr, asPlainNumber } from '@/src/lib/format';

const FILE = 'src/components/admin/DepositAdjustForms.tsx';
const BISECT_PHASE = 2;

function adjustLog(tag: string, extra?: Record<string, unknown>) {
  const payload = {
    tag,
    file: FILE,
    bisectPhase: BISECT_PHASE,
    surface: typeof window === 'undefined' ? 'server' : 'client',
    ts: Date.now(),
    ...extra,
  };
  console.error(tag, payload);
  try {
    void fetch('/api/admin/deposit-render-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // best-effort
  }
}

adjustLog('[ADJUST_MODULE_0]', { phase: 'module_eval_start' });
adjustLog('[ADJUST_MODULE_1]', { phase: 'after_imports', paiseToInr: typeof paiseToInr });

function CorrectDepositForm({
  bookingId,
  bookingDepositPaise,
  ledgerCollectedPaise,
  websiteDepositPaise,
}: {
  bookingId: string;
  bookingDepositPaise: number;
  ledgerCollectedPaise: number;
  websiteDepositPaise: number;
}) {
  const bound = correctDepositAction.bind(null, bookingId);
  const [state, runAction, pending] = useActionState(bound, initialActionState);

  adjustLog('[ADJUST_STEP_1]', {
    phase: 'CorrectDepositForm_render',
    bookingDepositPaise,
    bookingDepositPaiseType: typeof bookingDepositPaise,
    ledgerCollectedPaise,
    ledgerCollectedPaiseType: typeof ledgerCollectedPaise,
  });

  let bookingDepositLabel: string;
  let ledgerCollectedLabel: string;
  let websiteDepositLabel: string | null = null;
  let defaultValueInr: number;

  try {
    adjustLog('[ADJUST_STEP_2]', { fn: 'paiseToInr', variable: 'bookingDepositPaise' });
    bookingDepositLabel = paiseToInr(bookingDepositPaise);
    adjustLog('[ADJUST_STEP_3]', { fn: 'paiseToInr', variable: 'ledgerCollectedPaise' });
    ledgerCollectedLabel = paiseToInr(ledgerCollectedPaise);
    if (websiteDepositPaise > 0) {
      adjustLog('[ADJUST_STEP_4]', { fn: 'paiseToInr', variable: 'websiteDepositPaise' });
      websiteDepositLabel = paiseToInr(websiteDepositPaise);
    }
    adjustLog('[ADJUST_STEP_5]', { fn: 'asPlainNumber/defaultValue', variable: 'bookingDepositPaise' });
    defaultValueInr = Math.round(asPlainNumber(bookingDepositPaise) / 100);
    adjustLog('[ADJUST_STEP_5_ok]', { defaultValueInr });
  } catch (err) {
    adjustLog('[ADJUST_STEP_FAILED]', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  return (
    <form
      action={runAction}
      className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm"
    >
      <div>
        <h3 className="text-sm font-semibold text-indigo-900">Set / correct deposit collected</h3>
        <p className="mt-1 text-[11px] text-indigo-900/80">
          Sets the booking deposit and reconciles the ledger to this total. Use for grandfathered
          amounts or fixing a wrong entry after assignment.
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          Current booking deposit: <strong>{bookingDepositLabel}</strong>
          {' · '}
          Ledger collected: <strong>{ledgerCollectedLabel}</strong>
          {websiteDepositLabel ? (
            <>
              {' · '}
              Website default: <strong>{websiteDepositLabel}</strong>
            </>
          ) : null}
        </p>
      </div>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Total deposit collected (₹)
        </span>
        <input
          type="number"
          name="amountInr"
          min="0"
          step="1"
          required
          defaultValue={defaultValueInr}
          className="mt-1 block w-full max-w-xs rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Reason
        </span>
        <input
          type="text"
          name="reason"
          required
          maxLength={200}
          placeholder="e.g. grandfathered deposit before price increase"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800 disabled:bg-indigo-300"
      >
        {pending ? 'Saving…' : 'Set deposit & reconcile ledger'}
      </button>
      {state.status === 'ok' ? (
        <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{state.message}</p>
      ) : state.status === 'error' ? (
        <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{state.message}</p>
      ) : null}
    </form>
  );
}

export function DepositAdjustForms(props: {
  bookingId: string;
  bookingDepositPaise: number;
  ledgerCollectedPaise: number;
  websiteDepositPaise?: number;
}) {
  adjustLog('[ADJUST_MODULE_2]', {
    phase: 'function_entry',
    bookingId: props.bookingId,
    bookingDepositPaiseType: typeof props.bookingDepositPaise,
    ledgerCollectedPaiseType: typeof props.ledgerCollectedPaise,
  });

  return (
    <div className="space-y-4">
      <p
        data-adjust-bisect={BISECT_PHASE}
        className="rounded border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100"
      >
        DepositAdjustForms bisect-{BISECT_PHASE} — CorrectDepositForm
      </p>
      <CorrectDepositForm
        bookingId={props.bookingId}
        bookingDepositPaise={props.bookingDepositPaise}
        ledgerCollectedPaise={props.ledgerCollectedPaise}
        websiteDepositPaise={props.websiteDepositPaise ?? 0}
      />
    </div>
  );
}

adjustLog('[ADJUST_MODULE_3]', { phase: 'module_eval_complete' });
