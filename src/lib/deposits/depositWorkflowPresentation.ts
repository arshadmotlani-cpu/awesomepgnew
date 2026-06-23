import type { UnifiedDepositView } from '@/src/lib/deposits/unifiedDepositView';
import { paiseToInr } from '@/src/lib/format';

export type DepositWorkflowStageId =
  | 'collect'
  | 'held'
  | 'charges'
  | 'refund_pending'
  | 'refund_sent';

export type DepositWorkflowStage = {
  id: DepositWorkflowStageId;
  label: string;
};

export const DEPOSIT_WORKFLOW_STAGES: DepositWorkflowStage[] = [
  { id: 'collect', label: 'Collect' },
  { id: 'held', label: 'Held' },
  { id: 'charges', label: 'Charges' },
  { id: 'refund_pending', label: 'Refund pending' },
  { id: 'refund_sent', label: 'Refund sent' },
];

export type DepositWorkflowPresentation = {
  currentStageId: DepositWorkflowStageId;
  currentStageLabel: string;
  nextAction: string;
  primaryAction: {
    label: string;
    href: string;
  } | null;
  blockedBySync: boolean;
};

export function buildDepositWorkflowPresentation(input: {
  view: UnifiedDepositView | null;
  invoiceStatus: string | null;
  isFrozen: boolean;
  syncWarning: string | null;
}): DepositWorkflowPresentation | null {
  if (!input.view) return null;

  const { view, isFrozen, syncWarning } = input;
  const invoiceStatus = input.invoiceStatus ?? view.invoiceStatus;

  if (syncWarning) {
    return {
      currentStageId: 'collect',
      currentStageLabel: 'Wallet sync issue',
      nextAction: 'Resolve wallet mismatch before recording collections or refunds.',
      primaryAction: {
        label: 'Fix wallet sync',
        href: '#deposit-advanced',
      },
      blockedBySync: true,
    };
  }

  if (isFrozen || invoiceStatus === 'settled') {
    return {
      currentStageId: 'refund_sent',
      currentStageLabel: 'Refund sent · closed',
      nextAction: 'Deposit is settled. No further admin action.',
      primaryAction: null,
      blockedBySync: false,
    };
  }

  if (invoiceStatus === 'refund_pending' || view.depositCollectionStatus === 'refund_pending') {
    return {
      currentStageId: 'refund_pending',
      currentStageLabel: 'Refund pending',
      nextAction: `Approve final refund — ${paiseToInr(view.refundablePaise)} refundable after deductions.`,
      primaryAction: {
        label: 'Process refund',
        href: '#deposit-settlement',
      },
      blockedBySync: false,
    };
  }

  if (view.depositDuePaise > 0) {
    return {
      currentStageId: 'collect',
      currentStageLabel: view.depositCollectionStatus === 'overdue' ? 'Collect · overdue' : 'Collect deposit',
      nextAction: `${paiseToInr(view.depositDuePaise)} still due — record collection or send payment link from resident profile.`,
      primaryAction: {
        label: 'Record deposit collection',
        href: '#deposit-activity',
      },
      blockedBySync: false,
    };
  }

  if (invoiceStatus === 'held' || view.collectedPaise >= view.requiredPaise) {
    const hasDeductions = view.deductedPaise > 0;
    return {
      currentStageId: hasDeductions ? 'charges' : 'held',
      currentStageLabel: hasDeductions ? 'Held · charges applied' : 'Deposit held',
      nextAction: hasDeductions
        ? 'Charges recorded. Process refund when resident vacates.'
        : 'Deposit fully collected and held. No collection action needed.',
      primaryAction: hasDeductions
        ? { label: 'Open settlement', href: '#deposit-settlement' }
        : null,
      blockedBySync: false,
    };
  }

  return {
    currentStageId: 'collect',
    currentStageLabel: 'Collect deposit',
    nextAction: `${paiseToInr(Math.max(view.depositDuePaise, view.requiredPaise - view.collectedPaise))} outstanding.`,
    primaryAction: {
      label: 'Record deposit collection',
      href: '#deposit-activity',
    },
    blockedBySync: false,
  };
}

export function stageIndex(id: DepositWorkflowStageId): number {
  return DEPOSIT_WORKFLOW_STAGES.findIndex((s) => s.id === id);
}
