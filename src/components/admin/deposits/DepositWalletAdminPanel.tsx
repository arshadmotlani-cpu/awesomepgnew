'use client';

/**
 * WALLET BISECT PHASE 1 — server-action imports + hooks, minimal JSX.
 * Phase 0 OK. Phase 2+ restore UI sections from DepositWalletAdminPanel.full.tsx
 */

import { useActionState, useState, useTransition } from 'react';
import {
  cancelDepositInvoiceAction,
  editDepositSummaryAction,
  editDepositSummaryNoRevalidateAction,
  loadCancelDepositPreviewAction,
  loadRebuildDepositPreviewAction,
  rebuildDepositWalletAction,
  type DepositWalletActionState,
} from '@/app/(admin)/admin/deposits/deposit-wallet-actions';
import type { UnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';

const FILE = 'src/components/admin/deposits/DepositWalletAdminPanel.tsx';
const BISECT_PHASE = 1;
const idle: DepositWalletActionState = { status: 'idle' };

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
  phase: 'after_server_action_imports',
  editDepositSummaryAction: typeof editDepositSummaryAction,
  rebuildDepositWalletAction: typeof rebuildDepositWalletAction,
});

function WalletHooksProbe({ bookingId }: { bookingId: string }) {
  bisectLog('[WALLET_STEP_1]', { phase: 'hooks_probe_start', bookingId });

  useActionState(editDepositSummaryAction, idle);
  bisectLog('[WALLET_STEP_2]', { hook: 'editDepositSummaryAction' });

  useActionState(editDepositSummaryNoRevalidateAction, idle);
  bisectLog('[WALLET_STEP_3]', { hook: 'editDepositSummaryNoRevalidateAction' });

  useActionState(rebuildDepositWalletAction, idle);
  bisectLog('[WALLET_STEP_4]', { hook: 'rebuildDepositWalletAction' });

  useActionState(cancelDepositInvoiceAction, idle);
  bisectLog('[WALLET_STEP_5]', { hook: 'cancelDepositInvoiceAction' });

  useState<null>(null);
  useState<null>(null);
  useState<string | null>(null);
  useTransition();
  bisectLog('[WALLET_STEP_6]', { hooks: 'preview state + transition' });

  void loadRebuildDepositPreviewAction;
  void loadCancelDepositPreviewAction;
  bisectLog('[WALLET_STEP_7]', { hooks: 'preview actions referenced' });

  return null;
}

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
    <>
      <WalletHooksProbe bookingId={props.view.bookingId} />
      <div
        data-wallet-bisect={BISECT_PHASE}
        className="mt-6 rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
      >
        Wallet panel minimal render (bisect-{BISECT_PHASE} — hooks only)
      </div>
    </>
  );
}

bisectLog('[WALLET_MODULE_3]', { phase: 'module_eval_complete' });
