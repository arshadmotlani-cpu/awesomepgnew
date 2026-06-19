'use client';

/**
 * ADJUST BISECT PHASE 0 — minimal render, no hooks, no server-action imports.
 * Archive: DepositAdjustForms.full.tsx
 *
 * Known-bad context: DepositWalletAdminPanel bisect-0 OK; this component fails.
 */

const FILE = 'src/components/admin/DepositAdjustForms.tsx';
const BISECT_PHASE = 0;

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

adjustLog('[ADJUST_MODULE_1]', { phase: 'no_value_imports' });

export function DepositAdjustForms(props: {
  bookingId: string;
  bookingDepositPaise: number;
  ledgerCollectedPaise: number;
  websiteDepositPaise?: number;
}) {
  adjustLog('[ADJUST_MODULE_2]', {
    phase: 'function_entry',
    bookingId: props.bookingId,
    bookingDepositPaise: props.bookingDepositPaise,
    bookingDepositPaiseType: typeof props.bookingDepositPaise,
    ledgerCollectedPaise: props.ledgerCollectedPaise,
    ledgerCollectedPaiseType: typeof props.ledgerCollectedPaise,
    websiteDepositPaise: props.websiteDepositPaise ?? null,
  });

  return (
    <div
      data-adjust-bisect={BISECT_PHASE}
      className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
    >
      DepositAdjustForms minimal render (bisect-{BISECT_PHASE})
    </div>
  );
}

adjustLog('[ADJUST_MODULE_3]', { phase: 'module_eval_complete' });
