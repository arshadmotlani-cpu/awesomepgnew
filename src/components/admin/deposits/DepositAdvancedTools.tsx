'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  cancelDepositInvoiceAction,
  loadCancelDepositPreviewAction,
  loadRebuildDepositPreviewAction,
  rebuildDepositWalletAction,
  type DepositWalletActionState,
} from '@/app/(admin)/admin/deposits/deposit-wallet-actions';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { DepositLedgerReconcileForm } from '@/src/components/admin/DepositAdjustForms';
import {
  sanitizeDepositWalletPreview,
  sanitizeUnifiedDepositView,
  type DepositWalletPreview,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { paiseToInr } from '@/src/lib/format';

const idle: DepositWalletActionState = { status: 'idle' };

export function DepositAdvancedTools({
  view,
  bookingId,
  adjustProps,
}: {
  view: UnifiedDepositView;
  bookingId: string;
  adjustProps: {
    bookingDepositPaise: number;
    ledgerCollectedPaise: number;
    websiteDepositPaise: number;
  };
}) {
  const v = sanitizeUnifiedDepositView(view);

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Rebuild wallet, cancel invoice, or reconcile ledger — use only when you know what you need."
      defaultOpen={false}
    >
      <WalletAdvancedActions view={v} />
      <DepositLedgerReconcileForm bookingId={bookingId} {...adjustProps} />
    </AdminAdvancedToolsSection>
  );
}

function WalletAdvancedActions({ view }: { view: UnifiedDepositView }) {
  const [rebuildState, rebuildAction, rebuildPending] = useActionState(
    rebuildDepositWalletAction,
    idle,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelDepositInvoiceAction,
    idle,
  );
  const [rebuildPreview, setRebuildPreview] = useState<DepositWalletPreview | null>(null);
  const [cancelPreview, setCancelPreview] = useState<DepositWalletPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();

  function loadPreview(action: 'rebuild' | 'cancel') {
    setPreviewError(null);
    startPreview(async () => {
      const result =
        action === 'rebuild'
          ? await loadRebuildDepositPreviewAction(view.bookingId)
          : await loadCancelDepositPreviewAction(view.bookingId);
      if ('ok' in result && result.ok === false) {
        setPreviewError(result.error);
        if (action === 'rebuild') setRebuildPreview(null);
        else setCancelPreview(null);
        return;
      }
      const preview = sanitizeDepositWalletPreview(result as DepositWalletPreview);
      if (action === 'rebuild') setRebuildPreview(preview);
      else setCancelPreview(preview);
    });
  }

  return (
    <div className="space-y-6">
      {previewError ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {previewError}
        </p>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
        <h3 className="text-sm font-semibold text-white">Rebuild deposit wallet</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Recalculates amounts from the ledger. Does not add or remove ledger entries.
        </p>
        <button
          type="button"
          disabled={previewPending}
          onClick={() => loadPreview('rebuild')}
          className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
        >
          {previewPending ? 'Loading preview…' : 'Preview rebuild'}
        </button>
        {rebuildPreview ? <PreviewPanel preview={rebuildPreview} /> : null}
        <form action={rebuildAction} className="mt-3">
          <input type="hidden" name="bookingId" value={view.bookingId} />
          <input type="hidden" name="confirmPreview" value={rebuildPreview ? 'yes' : 'no'} />
          <button
            type="submit"
            disabled={rebuildPending || !rebuildPreview}
            className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40"
          >
            {rebuildPending ? 'Rebuilding…' : 'Run rebuild'}
          </button>
        </form>
        {rebuildState.status === 'ok' ? (
          <p className="mt-2 text-xs text-emerald-300">{rebuildState.message}</p>
        ) : null}
        {rebuildState.status === 'error' ? (
          <p className="mt-2 text-xs text-rose-300">{rebuildState.message}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
        <h3 className="text-sm font-semibold text-white">Cancel deposit invoice</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Clears the deposit obligation and zeroes the refundable balance. This cannot be undone
          lightly.
        </p>
        <button
          type="button"
          disabled={previewPending}
          onClick={() => loadPreview('cancel')}
          className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
        >
          {previewPending ? 'Loading preview…' : 'Preview cancel'}
        </button>
        {cancelPreview ? <PreviewPanel preview={cancelPreview} /> : null}
        <form action={cancelAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="bookingId" value={view.bookingId} />
          <input type="hidden" name="confirmPreview" value={cancelPreview ? 'yes' : 'no'} />
          <label className="text-xs">
            <span className="text-apg-silver">Type CANCEL to confirm</span>
            <input
              name="confirmText"
              required
              placeholder="CANCEL"
              className="apg-admin-field mt-1 block rounded-lg border border-white/10 bg-[#0B0F14] px-2 py-1 text-white"
            />
          </label>
          <button
            type="submit"
            disabled={cancelPending || !cancelPreview}
            className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
          >
            {cancelPending ? 'Cancelling…' : 'Cancel invoice'}
          </button>
        </form>
        {cancelState.status === 'ok' ? (
          <p className="mt-2 text-xs text-emerald-300">{cancelState.message}</p>
        ) : null}
        {cancelState.status === 'error' ? (
          <p className="mt-2 text-xs text-rose-300">{cancelState.message}</p>
        ) : null}
      </div>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: DepositWalletPreview }) {
  const sanitized = sanitizeDepositWalletPreview(preview);
  return (
    <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-500/5 p-3 text-xs">
      <p className="font-semibold text-sky-200">Preview — current vs after action</p>
      {sanitized.warnings.map((w) => (
        <p key={w} className="mt-2 text-amber-100">
          {w}
        </p>
      ))}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <PreviewColumn title="Current" view={sanitized.current} />
        <PreviewColumn title="After action" view={sanitized.expected} />
      </div>
      {sanitized.willModifyLedger ? (
        <p className="mt-2 text-amber-100">
          Ledger will change (deduction of {paiseToInr(sanitized.removesFromWalletPaise)}).
        </p>
      ) : (
        <p className="mt-2 text-apg-silver">No ledger entries will be added or removed.</p>
      )}
    </div>
  );
}

function PreviewColumn({ title, view }: { title: string; view: UnifiedDepositView }) {
  const v = sanitizeUnifiedDepositView(view);
  return (
    <div className="rounded border border-white/10 bg-[#0B0F14] p-2">
      <p className="mb-1 font-medium text-white">{title}</p>
      <ul className="space-y-0.5 text-apg-silver">
        <li>Required: {paiseToInr(v.requiredPaise)}</li>
        <li>Collected: {paiseToInr(v.collectedPaise)}</li>
        <li>Deductions: {paiseToInr(v.deductedPaise)}</li>
        <li>Refunded: {paiseToInr(v.refundedPaise)}</li>
        <li>Refundable: {paiseToInr(v.refundablePaise)}</li>
      </ul>
    </div>
  );
}
