'use client';

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
import type {
  DepositWalletPreview,
  UnifiedDepositView,
} from '@/src/services/depositOperations';
import { paiseToInr, asPlainNumber } from '@/src/lib/format';

const idle: DepositWalletActionState = { status: 'idle' };

export function DepositWalletAdminPanel({
  view,
  isFrozen,
}: {
  view: UnifiedDepositView;
  isFrozen: boolean;
}) {
  const [editState, editAction, editPending] = useActionState(editDepositSummaryAction, idle);
  const [editNoRevalState, editNoRevalAction, editNoRevalPending] = useActionState(
    editDepositSummaryNoRevalidateAction,
    idle,
  );
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
      const preview = result as DepositWalletPreview;
      if (action === 'rebuild') setRebuildPreview(preview);
      else setCancelPreview(preview);
    });
  }

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
            Deposit wallet
          </h2>
          <p className="mt-1 text-xs text-apg-silver">
            Unified view — ledger is source of truth for collected, deducted, and refundable.
          </p>
        </div>
        {view.invoiceStatus ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-apg-silver">
            {view.invoiceStatus}
          </span>
        ) : null}
      </div>

      {!view.walletInSync && view.walletMismatchReason ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Deposit wallet out of sync. {view.walletMismatchReason}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat label="Required" value={paiseToInr(view.requiredPaise)} />
        <Stat label="Collected" value={paiseToInr(view.collectedPaise)} accent="emerald" />
        <Stat label="Refundable" value={paiseToInr(view.refundablePaise)} accent="strong" />
        <Stat label="Deductions" value={paiseToInr(view.deductedPaise)} />
        <Stat label="Refunded" value={paiseToInr(view.refundedPaise)} />
        <Stat label="Due" value={paiseToInr(view.depositDuePaise)} />
      </dl>

      {!isFrozen ? (
        <>
          <form action={editAction} className="grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-3 sm:grid-cols-2">
            <input type="hidden" name="bookingId" value={view.bookingId} />
            <label className="text-sm">
              <span className="text-apg-silver">Required deposit (₹)</span>
              <input
                name="requiredInr"
                type="number"
                min="0"
                step="1"
                placeholder={(asPlainNumber(view.requiredPaise) / 100).toString()}
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
                placeholder={(asPlainNumber(view.collectedPaise) / 100).toString()}
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
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={editPending || editNoRevalPending}
                className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {editPending ? 'Saving…' : 'Save deposit corrections'}
              </button>
              <button
                type="submit"
                formAction={editNoRevalAction}
                disabled={editPending || editNoRevalPending}
                className="rounded-lg border border-amber-400/50 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
              >
                {editNoRevalPending ? 'Saving…' : 'Save deposit corrections (no revalidate)'}
              </button>
              {editState.status === 'ok' ? (
                <p className="w-full text-xs text-emerald-300">{editState.message}</p>
              ) : null}
              {editState.status === 'error' ? (
                <p className="w-full text-xs text-rose-300">{editState.message}</p>
              ) : null}
              {editNoRevalState.status === 'ok' ? (
                <p className="w-full text-xs text-emerald-300">{editNoRevalState.message}</p>
              ) : null}
              {editNoRevalState.status === 'error' ? (
                <p className="w-full text-xs text-rose-300">{editNoRevalState.message}</p>
              ) : null}
            </div>
          </form>

          {previewError ? (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {previewError}
            </p>
          ) : null}

          <div className="space-y-4 rounded-xl border border-white/10 bg-[#12161C] p-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
                Rebuild deposit wallet
              </h3>
              <p className="mt-1 text-xs text-apg-silver/80">
                Recalculates due and status from the ledger. Does not create or delete ledger rows.
              </p>
              <button
                type="button"
                disabled={previewPending}
                onClick={() => loadPreview('rebuild')}
                className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
              >
                {previewPending ? 'Loading preview…' : 'Preview rebuild'}
              </button>
              {rebuildPreview ? (
                <PreviewPanel preview={rebuildPreview} />
              ) : null}
              <form action={rebuildAction} className="mt-2">
                <input type="hidden" name="bookingId" value={view.bookingId} />
                <input type="hidden" name="confirmPreview" value={rebuildPreview ? 'yes' : 'no'} />
                <button
                  type="submit"
                  disabled={rebuildPending || !rebuildPreview}
                  className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {rebuildPending ? 'Rebuilding…' : 'Execute rebuild'}
                </button>
              </form>
              {rebuildState.status === 'ok' ? (
                <p className="mt-2 text-xs text-emerald-300">{rebuildState.message}</p>
              ) : null}
              {rebuildState.status === 'error' ? (
                <p className="mt-2 text-xs text-rose-300">{rebuildState.message}</p>
              ) : null}
            </div>

            <div className="border-t border-white/10 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
                Cancel deposit invoice
              </h3>
              <p className="mt-1 text-xs text-apg-silver/80">
                Zeros the deposit obligation and clears refundable wallet balance.
              </p>
              <button
                type="button"
                disabled={previewPending}
                onClick={() => loadPreview('cancel')}
                className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
              >
                {previewPending ? 'Loading preview…' : 'Preview cancel'}
              </button>
              {cancelPreview ? (
                <PreviewPanel preview={cancelPreview} />
              ) : null}
              <form action={cancelAction} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="bookingId" value={view.bookingId} />
                <input type="hidden" name="confirmPreview" value={cancelPreview ? 'yes' : 'no'} />
                <label className="text-xs">
                  <span className="text-apg-silver">Type CANCEL to void invoice</span>
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
                  {cancelPending ? 'Cancelling…' : 'Execute cancel'}
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
        </>
      ) : (
        <p className="text-xs text-apg-silver">This deposit is settled and frozen.</p>
      )}
    </section>
  );
}

function PreviewPanel({ preview }: { preview: DepositWalletPreview }) {
  return (
    <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-500/5 p-3 text-xs">
      <p className="font-semibold text-sky-200">Dry run — current vs expected</p>
      {preview.warnings.map((w) => (
        <p key={w} className="mt-2 text-amber-100">
          {w}
        </p>
      ))}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <PreviewColumn title="Current" view={preview.current} />
        <PreviewColumn title="After action" view={preview.expected} />
      </div>
      {preview.willModifyLedger ? (
        <p className="mt-2 text-amber-100">
          Ledger will be modified (deduction of {paiseToInr(preview.removesFromWalletPaise)}).
        </p>
      ) : (
        <p className="mt-2 text-apg-silver">No ledger rows will be created or deleted.</p>
      )}
    </div>
  );
}

function PreviewColumn({ title, view }: { title: string; view: UnifiedDepositView }) {
  return (
    <div className="rounded border border-white/10 bg-[#0B0F14] p-2">
      <p className="mb-1 font-medium text-white">{title}</p>
      <ul className="space-y-0.5 text-apg-silver">
        <li>Required: {paiseToInr(view.requiredPaise)}</li>
        <li>Collected: {paiseToInr(view.collectedPaise)}</li>
        <li>Deductions: {paiseToInr(view.deductedPaise)}</li>
        <li>Refunded: {paiseToInr(view.refundedPaise)}</li>
        <li>Refundable: {paiseToInr(view.refundablePaise)}</li>
        <li>Due: {paiseToInr(view.depositDuePaise)}</li>
      </ul>
    </div>
  );
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
