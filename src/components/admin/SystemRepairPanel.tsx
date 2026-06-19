'use client';

import { useState, useTransition } from 'react';
import {
  auditOccupancyRepairAction,
  executeCheckoutRepairAction,
  executeDashboardRepairAction,
  executeDepositRepairAction,
  executeOccupancyRepairAction,
  previewCheckoutRepairAction,
  previewDashboardRepairAction,
  previewDepositRepairAction,
  previewOccupancyRepairAction,
  type SystemRepairActionState,
} from '@/app/(admin)/admin/settings/system-repair-actions';

type ToolKey = 'occupancy' | 'deposits' | 'checkout' | 'dashboard';

export function SystemRepairPanel() {
  const [messages, setMessages] = useState<Partial<Record<ToolKey, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<ToolKey, string>>>({});
  const [previews, setPreviews] = useState<Partial<Record<ToolKey, string>>>({});
  const [pending, start] = useTransition();

  function run(
    tool: ToolKey,
    fn: () => Promise<SystemRepairActionState>,
    kind: 'preview' | 'message' | 'error',
  ) {
    start(async () => {
      const result = await fn();
      if (result.status === 'ok') {
        setErrors((s) => ({ ...s, [tool]: undefined }));
        if (kind === 'preview') {
          setPreviews((s) => ({ ...s, [tool]: result.message }));
        } else {
          setMessages((s) => ({ ...s, [tool]: result.message }));
        }
      } else if (result.status === 'error') {
        setErrors((s) => ({ ...s, [tool]: result.message }));
      }
    });
  }

  return (
    <div className="space-y-6">
      <RepairTool
        title="Rebuild Resident Occupancy From Bed Reservations"
        description="Align Residents, bed map, dashboard occupancy, and billing filters from bed_reservations SSOT. Preview before execute."
        pending={pending}
        previewText={previews.occupancy}
        message={messages.occupancy}
        error={errors.occupancy}
        onAudit={() => run('occupancy', auditOccupancyRepairAction, 'message')}
        onPreview={() => run('occupancy', previewOccupancyRepairAction, 'preview')}
        onDryRun={() => run('occupancy', () => executeOccupancyRepairAction(true), 'preview')}
        onExecute={() => run('occupancy', () => executeOccupancyRepairAction(false), 'message')}
        auditLabel="Audit"
      />

      <RepairTool
        title="Repair Deposits"
        description="Sync deposit due/status from ledger for bookings with wallet drift. Does not create ledger rows."
        pending={pending}
        previewText={previews.deposits}
        message={messages.deposits}
        error={errors.deposits}
        onPreview={() => run('deposits', previewDepositRepairAction, 'preview')}
        onDryRun={() => run('deposits', () => executeDepositRepairAction(true), 'message')}
        onExecute={() => run('deposits', () => executeDepositRepairAction(false), 'message')}
      />

      <RepairTool
        title="Repair Checkout Settlements"
        description="Remove orphan settlements for rejected/cancelled vacating and dedupe active rows per booking."
        pending={pending}
        previewText={previews.checkout}
        message={messages.checkout}
        error={errors.checkout}
        onPreview={() => run('checkout', previewCheckoutRepairAction, 'preview')}
        onDryRun={() => run('checkout', () => executeCheckoutRepairAction(true), 'message')}
        onExecute={() => run('checkout', () => executeCheckoutRepairAction(false), 'message')}
      />

      <RepairTool
        title="Recalculate Dashboard Metrics"
        description="Reconcile financial invoice mirrors and verify occupancy/revenue totals against SSOT."
        pending={pending}
        previewText={previews.dashboard}
        message={messages.dashboard}
        error={errors.dashboard}
        onPreview={() => run('dashboard', previewDashboardRepairAction, 'preview')}
        onDryRun={() => run('dashboard', () => executeDashboardRepairAction(true), 'message')}
        onExecute={() => run('dashboard', () => executeDashboardRepairAction(false), 'message')}
      />
    </div>
  );
}

function RepairTool({
  title,
  description,
  pending,
  previewText,
  message,
  error,
  onAudit,
  onPreview,
  onDryRun,
  onExecute,
  auditLabel = 'Preview',
}: {
  title: string;
  description: string;
  pending: boolean;
  previewText?: string;
  message?: string;
  error?: string;
  onAudit?: () => void;
  onPreview: () => void;
  onDryRun: () => void;
  onExecute: () => void;
  auditLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-apg-silver">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onAudit ? (
          <button
            type="button"
            disabled={pending}
            onClick={onAudit}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
          >
            {auditLabel}
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={onPreview}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDryRun}
          className="rounded-lg border border-sky-400/30 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/10 disabled:opacity-60"
        >
          Dry run
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onExecute}
          className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          Execute
        </button>
      </div>
      {previewText ? <p className="mt-2 text-xs text-sky-200">{previewText}</p> : null}
      {message ? <p className="mt-2 text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
