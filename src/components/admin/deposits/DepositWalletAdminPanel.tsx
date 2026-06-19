'use client';

import type { ReactNode } from 'react';
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
} from '@/src/lib/deposits/unifiedDepositView';
import {
  sanitizeDepositWalletPreview,
  sanitizeUnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { paiseToInr, asPlainNumber } from '@/src/lib/format';

const FILE = 'src/components/admin/deposits/DepositWalletAdminPanel.tsx';

const idle: DepositWalletActionState = { status: 'idle' };

/** Logged once per module load — confirms client bundle resolved all imports. */
console.error('[WALLET_IMPORT_AUDIT]', {
  file: FILE,
  imports: {
    react_useActionState: typeof useActionState,
    react_useState: typeof useState,
    react_useTransition: typeof useTransition,
    editDepositSummaryAction: typeof editDepositSummaryAction,
    editDepositSummaryNoRevalidateAction: typeof editDepositSummaryNoRevalidateAction,
    rebuildDepositWalletAction: typeof rebuildDepositWalletAction,
    cancelDepositInvoiceAction: typeof cancelDepositInvoiceAction,
    loadRebuildDepositPreviewAction: typeof loadRebuildDepositPreviewAction,
    loadCancelDepositPreviewAction: typeof loadCancelDepositPreviewAction,
    sanitizeUnifiedDepositView: typeof sanitizeUnifiedDepositView,
    sanitizeDepositWalletPreview: typeof sanitizeDepositWalletPreview,
    paiseToInr: typeof paiseToInr,
    asPlainNumber: typeof asPlainNumber,
  },
  serverActions: {
    editDepositSummaryAction: String(editDepositSummaryAction),
    editDepositSummaryNoRevalidateAction: String(editDepositSummaryNoRevalidateAction),
    rebuildDepositWalletAction: String(rebuildDepositWalletAction),
    cancelDepositInvoiceAction: String(cancelDepositInvoiceAction),
    loadRebuildDepositPreviewAction: String(loadRebuildDepositPreviewAction),
    loadCancelDepositPreviewAction: String(loadCancelDepositPreviewAction),
  },
});

const DEPOSIT_VIEW_PAISE_FIELDS = [
  'requiredPaise',
  'collectedPaise',
  'deductedPaise',
  'refundedPaise',
  'refundablePaise',
  'depositDuePaise',
] as const;

type WalletDiag = {
  step: string;
  file: string;
  function: string;
  variable?: string;
  value?: string;
  message: string;
  stack?: string;
};

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return `${value}n`;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function walletStepLog(step: string, fn: string, extra?: Record<string, unknown>) {
  console.error(step, { file: FILE, function: fn, ...extra });
}

function walletStepFailed(
  step: string,
  fn: string,
  err: unknown,
  opts?: { variable?: string; value?: unknown },
): WalletDiag {
  const error = err instanceof Error ? err : new Error(String(err));
  const diag: WalletDiag = {
    step,
    file: FILE,
    function: fn,
    variable: opts?.variable,
    value: opts?.value !== undefined ? describeValue(opts.value) : undefined,
    message: error.message,
    stack: error.stack,
  };
  console.error('[WALLET_STEP_FAILED]', diag);
  return diag;
}

function WalletStepFallback({ diag }: { diag: WalletDiag }) {
  return (
    <div className="my-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
      <p className="font-semibold">[DEPOSIT_WALLET_PANEL_FAILED] {diag.step}</p>
      <dl className="mt-2 space-y-1 font-mono text-[11px] text-rose-200/90">
        <div>
          <dt className="inline text-rose-300">file: </dt>
          <dd className="inline">{diag.file}</dd>
        </div>
        <div>
          <dt className="inline text-rose-300">function: </dt>
          <dd className="inline">{diag.function}</dd>
        </div>
        {diag.variable ? (
          <div>
            <dt className="inline text-rose-300">variable: </dt>
            <dd className="inline">{diag.variable}</dd>
          </div>
        ) : null}
        {diag.value !== undefined ? (
          <div>
            <dt className="inline text-rose-300">value: </dt>
            <dd className="inline break-all">{diag.value}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline text-rose-300">message: </dt>
          <dd className="inline">{diag.message}</dd>
        </div>
      </dl>
      {diag.stack ? (
        <pre className="mt-2 max-h-40 overflow-auto text-[10px] text-rose-200/70">{diag.stack}</pre>
      ) : null}
    </div>
  );
}

function runWalletStep<T>(
  step: string,
  fn: string,
  run: () => T,
  opts?: { variable?: string; value?: unknown },
): { ok: true; value: T } | { ok: false; diag: WalletDiag } {
  walletStepLog(step, fn, {
    variable: opts?.variable,
    value: opts?.value !== undefined ? describeValue(opts.value) : undefined,
    valueType: opts?.value !== undefined ? typeof opts?.value : undefined,
  });
  try {
    const value = run();
    walletStepLog(`${step}_ok`, fn);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, diag: walletStepFailed(step, fn, err, opts) };
  }
}

function guardWalletPanelProps(props: {
  view: UnifiedDepositView;
  isFrozen: boolean;
}): { view: UnifiedDepositView; isFrozen: boolean } {
  const view = { ...props.view };
  for (const field of DEPOSIT_VIEW_PAISE_FIELDS) {
    const raw = view[field];
    if (typeof raw === 'bigint') {
      console.error('[BIGINT_LEAK]', `view.${field}`, raw);
      (view as Record<string, unknown>)[field] = Number(raw);
    }
  }
  return {
    view: sanitizeUnifiedDepositView(view),
    isFrozen: Boolean(props.isFrozen),
  };
}

function safeDepositPreview(preview: DepositWalletPreview): DepositWalletPreview {
  return sanitizeDepositWalletPreview(preview);
}

function safePaiseToInr(step: string, fn: string, variable: string, paise: unknown): string {
  const result = runWalletStep(step, fn, () => paiseToInr(paise as number), {
    variable,
    value: paise,
  });
  if (!result.ok) throw Object.assign(new Error(result.diag.message), { walletDiag: result.diag });
  return result.value;
}

function safePlaceholderInr(
  step: string,
  fn: string,
  variable: string,
  paise: unknown,
): string {
  const result = runWalletStep(
    step,
    fn,
    () => (asPlainNumber(paise) / 100).toString(),
    { variable, value: paise },
  );
  if (!result.ok) throw Object.assign(new Error(result.diag.message), { walletDiag: result.diag });
  return result.value;
}

export function DepositWalletAdminPanel({
  view,
  isFrozen,
}: {
  view: UnifiedDepositView;
  isFrozen: boolean;
}) {
  walletStepLog('[WALLET_STEP_1]', 'DepositWalletAdminPanel', {
    variable: 'props.view',
    value: describeValue(view),
    isFrozen,
  });

  const guardResult = runWalletStep(
    '[WALLET_STEP_1_sanitize]',
    'guardWalletPanelProps',
    () => guardWalletPanelProps({ view, isFrozen }),
    { variable: 'view', value: view },
  );
  if (!guardResult.ok) {
    return <WalletStepFallback diag={guardResult.diag} />;
  }
  const { view: v, isFrozen: frozen } = guardResult.value;

  walletStepLog('[WALLET_STEP_2]', 'useActionState', { hook: 'editDepositSummaryAction' });
  const [editState, editAction, editPending] = useActionState(editDepositSummaryAction, idle);

  walletStepLog('[WALLET_STEP_3]', 'useActionState', { hook: 'editDepositSummaryNoRevalidateAction' });
  const [editNoRevalState, editNoRevalAction, editNoRevalPending] = useActionState(
    editDepositSummaryNoRevalidateAction,
    idle,
  );

  walletStepLog('[WALLET_STEP_4]', 'useActionState', { hook: 'rebuildDepositWalletAction' });
  const [rebuildState, rebuildAction, rebuildPending] = useActionState(
    rebuildDepositWalletAction,
    idle,
  );

  walletStepLog('[WALLET_STEP_5]', 'useActionState', { hook: 'cancelDepositInvoiceAction' });
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelDepositInvoiceAction,
    idle,
  );

  walletStepLog('[WALLET_STEP_6]', 'useState/useTransition', { hooks: 'preview state' });
  const [rebuildPreview, setRebuildPreview] = useState<DepositWalletPreview | null>(null);
  const [cancelPreview, setCancelPreview] = useState<DepositWalletPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();

  function loadPreview(action: 'rebuild' | 'cancel') {
    walletStepLog('[WALLET_STEP_PREVIEW_LOAD]', 'loadPreview', { action, bookingId: v.bookingId });
    setPreviewError(null);
    startPreview(async () => {
      try {
        const result =
          action === 'rebuild'
            ? await loadRebuildDepositPreviewAction(v.bookingId)
            : await loadCancelDepositPreviewAction(v.bookingId);
        walletStepLog('[WALLET_STEP_PREVIEW_RESULT]', 'loadPreview', {
          action,
          resultType: 'ok' in result && result.ok === false ? 'error' : 'preview',
        });
        if ('ok' in result && result.ok === false) {
          setPreviewError(result.error);
          if (action === 'rebuild') setRebuildPreview(null);
          else setCancelPreview(null);
          return;
        }
        const preview = runWalletStep(
          '[WALLET_STEP_PREVIEW_SANITIZE]',
          'safeDepositPreview',
          () => safeDepositPreview(result as DepositWalletPreview),
          { variable: 'preview', value: result },
        );
        if (!preview.ok) {
          setPreviewError(preview.diag.message);
          return;
        }
        if (action === 'rebuild') setRebuildPreview(preview.value);
        else setCancelPreview(preview.value);
      } catch (err) {
        walletStepFailed('[WALLET_STEP_PREVIEW_LOAD]', 'loadPreview', err, {
          variable: 'action',
          value: action,
        });
        setPreviewError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  walletStepLog('[WALLET_STEP_7]', 'DepositWalletAdminPanel', { phase: 'render_start', bookingId: v.bookingId });

  const sections: ReactNode[] = [];
  let firstFailure: WalletDiag | null = null;

  function pushSection(step: string, fn: string, render: () => ReactNode) {
    if (firstFailure) return;
    const result = runWalletStep(step, fn, render);
    if (!result.ok) {
      firstFailure = result.diag;
      sections.push(<WalletStepFallback key={step} diag={result.diag} />);
      return;
    }
    sections.push(<div key={step}>{result.value}</div>);
  }

  pushSection('[WALLET_STEP_8]', 'renderHeader', () => (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
          Deposit wallet
        </h2>
        <p className="mt-1 text-xs text-apg-silver">
          Unified view — ledger is source of truth for collected, deducted, and refundable.
        </p>
      </div>
      {runWalletStep('[WALLET_STEP_8_badge]', 'invoiceStatusBadge', () => v.invoiceStatus, {
        variable: 'v.invoiceStatus',
        value: v.invoiceStatus,
      }).ok && v.invoiceStatus ? (
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-apg-silver">
          {v.invoiceStatus}
        </span>
      ) : null}
    </div>
  ));

  pushSection('[WALLET_STEP_9]', 'walletMismatchBanner', () => {
    const show = !v.walletInSync && v.walletMismatchReason;
    walletStepLog('[WALLET_STEP_9_calc]', 'walletMismatchBanner', {
      walletInSync: v.walletInSync,
      walletMismatchReason: v.walletMismatchReason,
      show,
    });
    if (!show) return null;
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Deposit wallet out of sync. {v.walletMismatchReason}
      </div>
    );
  });

  pushSection('[WALLET_STEP_10]', 'statsGrid', () => (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      <Stat
        label="Required"
        value={safePaiseToInr('[WALLET_STEP_10_required]', 'statsGrid', 'v.requiredPaise', v.requiredPaise)}
      />
      <Stat
        label="Collected"
        value={safePaiseToInr('[WALLET_STEP_10_collected]', 'statsGrid', 'v.collectedPaise', v.collectedPaise)}
        accent="emerald"
      />
      <Stat
        label="Refundable"
        value={safePaiseToInr('[WALLET_STEP_10_refundable]', 'statsGrid', 'v.refundablePaise', v.refundablePaise)}
        accent="strong"
      />
      <Stat
        label="Deductions"
        value={safePaiseToInr('[WALLET_STEP_10_deductions]', 'statsGrid', 'v.deductedPaise', v.deductedPaise)}
      />
      <Stat
        label="Refunded"
        value={safePaiseToInr('[WALLET_STEP_10_refunded]', 'statsGrid', 'v.refundedPaise', v.refundedPaise)}
      />
      <Stat
        label="Due"
        value={safePaiseToInr('[WALLET_STEP_10_due]', 'statsGrid', 'v.depositDuePaise', v.depositDuePaise)}
      />
    </dl>
  ));

  pushSection('[WALLET_STEP_11]', 'frozenGate', () => {
    walletStepLog('[WALLET_STEP_11_calc]', 'frozenGate', { frozen });
    if (frozen) {
      return <p className="text-xs text-apg-silver">This deposit is settled and frozen.</p>;
    }
    return null;
  });

  if (!frozen && !firstFailure) {
    pushSection('[WALLET_STEP_12]', 'editForm', () => {
      const requiredPlaceholder = safePlaceholderInr(
        '[WALLET_STEP_12_required_placeholder]',
        'editForm',
        'v.requiredPaise',
        v.requiredPaise,
      );
      const collectedPlaceholder = safePlaceholderInr(
        '[WALLET_STEP_12_collected_placeholder]',
        'editForm',
        'v.collectedPaise',
        v.collectedPaise,
      );
      return (
        <form
          action={editAction}
          className="grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-3 sm:grid-cols-2"
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
      );
    });

    pushSection('[WALLET_STEP_13]', 'previewError', () =>
      previewError ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {previewError}
        </p>
      ) : null,
    );

    pushSection('[WALLET_STEP_14]', 'rebuildCancelSection', () => (
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
          {rebuildPreview ? <PreviewPanel preview={rebuildPreview} stepPrefix="WALLET_STEP_15" /> : null}
          <form action={rebuildAction} className="mt-2">
            <input type="hidden" name="bookingId" value={v.bookingId} />
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
          {cancelPreview ? <PreviewPanel preview={cancelPreview} stepPrefix="WALLET_STEP_16" /> : null}
          <form action={cancelAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="bookingId" value={v.bookingId} />
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
    ));
  }

  walletStepLog('[WALLET_STEP_17]', 'DepositWalletAdminPanel', { phase: 'render_complete' });

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      {sections}
    </section>
  );
}

function PreviewPanel({
  preview,
  stepPrefix,
}: {
  preview: DepositWalletPreview;
  stepPrefix: string;
}) {
  const panelResult = runWalletStep(`[${stepPrefix}_panel]`, 'PreviewPanel', () => {
    const sanitized = safeDepositPreview(preview);
    const removesLabel = sanitized.willModifyLedger
      ? safePaiseToInr(
          `[${stepPrefix}_removes]`,
          'PreviewPanel',
          'preview.removesFromWalletPaise',
          sanitized.removesFromWalletPaise,
        )
      : null;
    return { sanitized, removesLabel };
  }, { variable: 'preview', value: preview });

  if (!panelResult.ok) {
    return <WalletStepFallback diag={panelResult.diag} />;
  }

  const { sanitized, removesLabel } = panelResult.value;

  return (
    <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-500/5 p-3 text-xs">
      <p className="font-semibold text-sky-200">Dry run — current vs expected</p>
      {sanitized.warnings.map((w) => (
        <p key={w} className="mt-2 text-amber-100">
          {w}
        </p>
      ))}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <PreviewColumn title="Current" view={sanitized.current} stepPrefix={`${stepPrefix}_current`} />
        <PreviewColumn title="After action" view={sanitized.expected} stepPrefix={`${stepPrefix}_expected`} />
      </div>
      {sanitized.willModifyLedger ? (
        <p className="mt-2 text-amber-100">Ledger will be modified (deduction of {removesLabel}).</p>
      ) : (
        <p className="mt-2 text-apg-silver">No ledger rows will be created or deleted.</p>
      )}
    </div>
  );
}

function PreviewColumn({
  title,
  view,
  stepPrefix,
}: {
  title: string;
  view: UnifiedDepositView;
  stepPrefix: string;
}) {
  const columnResult = runWalletStep(`[${stepPrefix}_column]`, 'PreviewColumn', () => {
    const v = runWalletStep(
      `[${stepPrefix}_sanitize]`,
      'sanitizeUnifiedDepositView',
      () => sanitizeUnifiedDepositView(view),
      { variable: 'view', value: view },
    );
    if (!v.ok) throw Object.assign(new Error(v.diag.message), { walletDiag: v.diag });

    const rows = [
      { label: 'Required', field: 'requiredPaise' as const },
      { label: 'Collected', field: 'collectedPaise' as const },
      { label: 'Deductions', field: 'deductedPaise' as const },
      { label: 'Refunded', field: 'refundedPaise' as const },
      { label: 'Refundable', field: 'refundablePaise' as const },
      { label: 'Due', field: 'depositDuePaise' as const },
    ].map(({ label, field }) => ({
      label,
      display: safePaiseToInr(`[${stepPrefix}_${field}]`, 'PreviewColumn', `v.${field}`, v.value[field]),
    }));

    return { title, rows };
  }, { variable: 'view', value: view });

  if (!columnResult.ok) {
    return <WalletStepFallback diag={columnResult.diag} />;
  }

  return (
    <div className="rounded border border-white/10 bg-[#0B0F14] p-2">
      <p className="mb-1 font-medium text-white">{columnResult.value.title}</p>
      <ul className="space-y-0.5 text-apg-silver">
        {columnResult.value.rows.map((row) => (
          <li key={row.label}>
            {row.label}: {row.display}
          </li>
        ))}
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
