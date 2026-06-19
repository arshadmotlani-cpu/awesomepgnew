'use client';

/**
 * ADJUST BISECT PHASE 1 — server-action imports + useActionState hooks, minimal JSX.
 * Phase 0 OK. Phase 2 will add CorrectDepositForm. Phase 3 add/deduct/refund grid.
 * Archive: DepositAdjustForms.full.tsx
 */

import { useActionState } from 'react';
import {
  addDepositAction,
  deductDepositAction,
  refundDepositAction,
  correctDepositAction,
  initialActionState,
} from '@/app/(admin)/admin/deposits/[bookingId]/actions';

const FILE = 'src/components/admin/DepositAdjustForms.tsx';
const BISECT_PHASE = 1;

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

adjustLog('[ADJUST_MODULE_1]', {
  phase: 'after_server_action_imports',
  correctDepositAction: typeof correctDepositAction,
  addDepositAction: typeof addDepositAction,
});

/** Mount all hooks used by the full component without rendering form JSX. */
function AdjustHooksProbe({ bookingId }: { bookingId: string }) {
  adjustLog('[ADJUST_STEP_1]', { phase: 'hooks_probe_start', bookingId });

  useActionState(correctDepositAction.bind(null, bookingId), initialActionState);
  adjustLog('[ADJUST_STEP_2]', { hook: 'correctDepositAction' });

  useActionState(addDepositAction.bind(null, bookingId), initialActionState);
  adjustLog('[ADJUST_STEP_3]', { hook: 'addDepositAction' });

  useActionState(deductDepositAction.bind(null, bookingId), initialActionState);
  adjustLog('[ADJUST_STEP_4]', { hook: 'deductDepositAction' });

  useActionState(refundDepositAction.bind(null, bookingId), initialActionState);
  adjustLog('[ADJUST_STEP_5]', { hook: 'refundDepositAction' });

  return null;
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
    <>
      <AdjustHooksProbe bookingId={props.bookingId} />
      <div
        data-adjust-bisect={BISECT_PHASE}
        className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
      >
        DepositAdjustForms minimal render (bisect-{BISECT_PHASE} — hooks only)
      </div>
    </>
  );
}

adjustLog('[ADJUST_MODULE_3]', { phase: 'module_eval_complete' });
