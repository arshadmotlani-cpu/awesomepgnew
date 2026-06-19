'use client';

/**
 * WALLET BISECT PHASE 0 — minimal render, no hooks, no server-action imports.
 * If this crashes → problem is type import chain or parent boundary/props.
 * If this works → reintroduce imports/sections in later bisect commits.
 *
 * Known-bad commits: b013ea7 (full diagnostics), 75d0de9 (bigint fix + full UI)
 * Known-good parent page: page-level cards render; only this panel failed.
 */

import type { UnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';

const FILE = 'src/components/admin/deposits/DepositWalletAdminPanel.tsx';
const BISECT_PHASE = 0;

function bisectLog(tag: string, extra?: Record<string, unknown>) {
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

bisectLog('[WALLET_MODULE_0]', { phase: 'module_eval_start' });

bisectLog('[WALLET_MODULE_1]', {
  phase: 'after_type_import',
  unifiedDepositViewType: 'type-only',
});

export function DepositWalletAdminPanel(props: {
  view: UnifiedDepositView;
  isFrozen: boolean;
}) {
  bisectLog('[WALLET_MODULE_2]', {
    phase: 'function_entry',
    bookingId: props.view?.bookingId ?? null,
    isFrozen: props.isFrozen,
  });

  return (
    <div
      data-wallet-bisect={BISECT_PHASE}
      className="mt-6 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
    >
      Wallet panel minimal render (bisect-{BISECT_PHASE})
    </div>
  );
}

bisectLog('[WALLET_MODULE_3]', { phase: 'module_eval_complete' });
