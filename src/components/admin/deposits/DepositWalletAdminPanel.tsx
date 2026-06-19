'use client';

/**
 * WALLET BISECT PHASE 2 — header + stats grid (paiseToInr path).
 * Phase 3 will add edit form. Archive: DepositWalletAdminPanel.full.tsx
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
import {
  sanitizeUnifiedDepositView,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { paiseToInr } from '@/src/lib/format';

const FILE = 'src/components/admin/deposits/DepositWalletAdminPanel.tsx';
const BISECT_PHASE = 2;
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
bisectLog('[WALLET_MODULE_1]', { phase: 'after_imports', paiseToInr: typeof paiseToInr });

function WalletHooksProbe({ bookingId }: { bookingId: string }) {
  useActionState(editDepositSummaryAction, idle);
  useActionState(editDepositSummaryNoRevalidateAction, idle);
  useActionState(rebuildDepositWalletAction, idle);
  useActionState(cancelDepositInvoiceAction, idle);
  useState<null>(null);
  useState<null>(null);
  useState<string | null>(null);
  useTransition();
  void loadRebuildDepositPreviewAction;
  void loadCancelDepositPreviewAction;
  void bookingId;
  return null;
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'strong';
}) {
  const cls =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'strong'
        ? 'text-white font-semibold'
        : 'text-white';
  return (
    <div className="rounded-lg border border-white/10 bg-[#12161C] p-3">
      <dt className="text-[10px] uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-1 text-sm tabular-nums ${cls}`}>{value}</dd>
    </div>
  );
}

export function DepositWalletAdminPanel(props: {
  view: UnifiedDepositView;
  isFrozen: boolean;
}) {
  bisectLog('[WALLET_MODULE_2]', { phase: 'function_entry', bookingId: props.view?.bookingId });

  const v = sanitizeUnifiedDepositView(props.view);

  bisectLog('[WALLET_STEP_8]', { phase: 'header_stats_start' });

  let requiredLabel: string;
  let collectedLabel: string;
  let refundableLabel: string;
  let deductedLabel: string;
  let refundedLabel: string;
  let dueLabel: string;

  try {
    bisectLog('[WALLET_STEP_10_required]', { variable: 'v.requiredPaise', type: typeof v.requiredPaise });
    requiredLabel = paiseToInr(v.requiredPaise);
    bisectLog('[WALLET_STEP_10_collected]', { variable: 'v.collectedPaise' });
    collectedLabel = paiseToInr(v.collectedPaise);
    bisectLog('[WALLET_STEP_10_refundable]', { variable: 'v.refundablePaise' });
    refundableLabel = paiseToInr(v.refundablePaise);
    bisectLog('[WALLET_STEP_10_deductions]', { variable: 'v.deductedPaise' });
    deductedLabel = paiseToInr(v.deductedPaise);
    bisectLog('[WALLET_STEP_10_refunded]', { variable: 'v.refundedPaise' });
    refundedLabel = paiseToInr(v.refundedPaise);
    bisectLog('[WALLET_STEP_10_due]', { variable: 'v.depositDuePaise' });
    dueLabel = paiseToInr(v.depositDuePaise);
    bisectLog('[WALLET_STEP_10_ok]', { phase: 'all_paiseToInr_ok' });
  } catch (err) {
    bisectLog('[WALLET_STEP_FAILED]', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      <WalletHooksProbe bookingId={v.bookingId} />
      <p
        data-wallet-bisect={BISECT_PHASE}
        className="rounded border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100"
      >
        Wallet panel bisect-{BISECT_PHASE} — header + stats
      </p>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
            Deposit wallet
          </h2>
          <p className="mt-1 text-xs text-apg-silver">
            Unified view — ledger is source of truth for collected, deducted, and refundable.
          </p>
        </div>
        {v.invoiceStatus ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-apg-silver">
            {v.invoiceStatus}
          </span>
        ) : null}
      </div>

      {!v.walletInSync && v.walletMismatchReason ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Deposit wallet out of sync. {v.walletMismatchReason}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat label="Required" value={requiredLabel} />
        <Stat label="Collected" value={collectedLabel} accent="emerald" />
        <Stat label="Refundable" value={refundableLabel} accent="strong" />
        <Stat label="Deductions" value={deductedLabel} />
        <Stat label="Refunded" value={refundedLabel} />
        <Stat label="Due" value={dueLabel} />
      </dl>
    </section>
  );
}

bisectLog('[WALLET_MODULE_3]', { phase: 'module_eval_complete' });
