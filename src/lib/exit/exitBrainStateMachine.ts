/**
 * Resident Exit Brain — explicit lifecycle state machine (move-out coordinator SSOT).
 *
 * Services and UI should consume `capabilities` — not raw DB status strings.
 * Settlement math stays in CheckoutSettlementEngineV2 / Billing Brain.
 */
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';
import type { ExitBrainProjectionInput } from '@/src/lib/exit/exitBrainPhase';

/** Canonical move-out lifecycle states (ordered progression). */
export type ExitBrainLifecycleState =
  | 'inactive'
  | 'notice_submitted'
  | 'notice_approved'
  | 'exit_active'
  | 'checkout_pending'
  | 'checkout_completed'
  | 'refund_pending'
  | 'refund_completed'
  | 'archived';

export const EXIT_BRAIN_LIFECYCLE_ORDER: readonly ExitBrainLifecycleState[] = [
  'inactive',
  'notice_submitted',
  'notice_approved',
  'exit_active',
  'checkout_pending',
  'checkout_completed',
  'refund_pending',
  'refund_completed',
  'archived',
] as const;

export const EXIT_BRAIN_LIFECYCLE_LABELS: Record<ExitBrainLifecycleState, string> = {
  inactive: 'Not in exit',
  notice_submitted: 'Notice submitted',
  notice_approved: 'Notice approved',
  exit_active: 'Exit active',
  checkout_pending: 'Checkout pending',
  checkout_completed: 'Checkout completed',
  refund_pending: 'Refund pending',
  refund_completed: 'Refund completed',
  archived: 'Archived',
};

export type ExitBrainCapabilityKey =
  | 'canTransferRoom'
  | 'canMoveBed'
  | 'canMergeResidency'
  | 'canGenerateCheckout'
  | 'canRequestRefund'
  | 'canArchive'
  | 'canEditVacating';

export type ExitBrainCapability = {
  allowed: boolean;
  reason?: string;
};

export type ExitBrainCapabilities = Record<ExitBrainCapabilityKey, ExitBrainCapability>;

export type ExitBrainLifecycle = {
  state: ExitBrainLifecycleState;
  stateLabel: string;
  capabilities: ExitBrainCapabilities;
  /** Rent late fees + notice penalty frozen (exit brain row active). */
  penaltiesFrozen: boolean;
  /** Same as penaltiesFrozen — inventory / billing exit mode. */
  isExitMode: boolean;
};

export type ExitBrainStateMachineInput = ExitBrainProjectionInput & {
  hasSettlement: boolean;
  /** From deposit refund unlock (vacate date / fixed-stay rules). */
  refundRequestEligible?: boolean;
};

function cap(allowed: boolean, reason?: string): ExitBrainCapability {
  return { allowed, reason: allowed ? undefined : reason };
}

export function exitBrainLifecycleStateLabel(state: ExitBrainLifecycleState): string {
  return EXIT_BRAIN_LIFECYCLE_LABELS[state];
}

export function resolveExitBrainLifecycleState(input: ExitBrainStateMachineInput): ExitBrainLifecycleState {
  const { vacatingStatus, exitBrainStatus, settlementStatus } = input;

  if (!vacatingStatus || vacatingStatus === 'rejected') return 'inactive';

  if (
    settlementStatus === 'archived' ||
    (vacatingStatus === 'completed' &&
      (settlementStatus === 'completed' || settlementStatus === 'archived'))
  ) {
    return 'archived';
  }

  if (settlementStatus === 'refund_paid' || input.refundPaidAt) {
    return 'refund_completed';
  }

  if (settlementStatus === 'refund_pending') {
    return 'refund_pending';
  }

  if (settlementStatus === 'approved') {
    return 'checkout_completed';
  }

  if (
    settlementStatus === 'awaiting_admin_review' ||
    settlementStatus === 'awaiting_resident_details'
  ) {
    return 'checkout_pending';
  }

  if (exitBrainStatus === 'active') {
    return input.hasSettlement ? 'checkout_pending' : 'exit_active';
  }

  if (vacatingStatus === 'approved') {
    return 'notice_approved';
  }

  if (vacatingStatus === 'completed') {
    return settlementStatus === 'completed' ? 'archived' : 'refund_completed';
  }

  if (vacatingStatus === 'pending') {
    return 'notice_submitted';
  }

  return 'inactive';
}

const EXIT_MODE_STATES: ReadonlySet<ExitBrainLifecycleState> = new Set([
  'notice_approved',
  'exit_active',
  'checkout_pending',
  'checkout_completed',
  'refund_pending',
]);

export function deriveExitBrainCapabilities(
  state: ExitBrainLifecycleState,
  input: ExitBrainStateMachineInput,
): ExitBrainCapabilities {
  const locked = EXIT_MODE_STATES.has(state) || state === 'refund_completed';
  const inventoryLocked = locked;
  const settlementStarted =
    input.hasSettlement &&
    state !== 'inactive' &&
    state !== 'notice_submitted' &&
    state !== 'notice_approved';

  const inventoryBlockReason = 'Blocked during move-out (Exit Mode). Owner override required.';

  switch (state) {
    case 'inactive':
      return {
        canTransferRoom: cap(true),
        canMoveBed: cap(true),
        canMergeResidency: cap(true),
        canGenerateCheckout: cap(false, 'No active move-out'),
        canRequestRefund: cap(false, 'No active move-out'),
        canArchive: cap(false),
        canEditVacating: cap(false, 'No active move-out'),
      };

    case 'notice_submitted':
      return {
        canTransferRoom: cap(true),
        canMoveBed: cap(true),
        canMergeResidency: cap(true),
        canGenerateCheckout: cap(false, 'Awaiting move-out approval'),
        canRequestRefund: cap(false, 'Awaiting move-out approval'),
        canArchive: cap(false),
        canEditVacating: cap(true),
      };

    case 'notice_approved':
      return {
        canTransferRoom: cap(false, inventoryBlockReason),
        canMoveBed: cap(false, inventoryBlockReason),
        canMergeResidency: cap(false, inventoryBlockReason),
        canGenerateCheckout: cap(!input.hasSettlement, 'Checkout settlement already exists'),
        canRequestRefund: cap(false, 'Checkout not started'),
        canArchive: cap(false),
        canEditVacating: cap(!settlementStarted, 'Settlement started — vacating locked'),
      };

    case 'exit_active':
      return {
        canTransferRoom: cap(false, inventoryBlockReason),
        canMoveBed: cap(false, inventoryBlockReason),
        canMergeResidency: cap(false, inventoryBlockReason),
        canGenerateCheckout: cap(!input.hasSettlement, 'Checkout settlement already exists'),
        canRequestRefund: cap(
          input.refundRequestEligible ?? false,
          'Refund unlocks on approved move-out date',
        ),
        canArchive: cap(false),
        canEditVacating: cap(!settlementStarted, 'Settlement started — vacating locked'),
      };

    case 'checkout_pending':
      return {
        canTransferRoom: cap(false, inventoryBlockReason),
        canMoveBed: cap(false, inventoryBlockReason),
        canMergeResidency: cap(false, inventoryBlockReason),
        canGenerateCheckout: cap(false, 'Checkout settlement in progress'),
        canRequestRefund: cap(
          input.refundRequestEligible ?? false,
          'Refund unlocks on approved move-out date or after resident details submitted',
        ),
        canArchive: cap(false),
        canEditVacating: cap(false, 'Checkout in progress'),
      };

    case 'checkout_completed':
      return {
        canTransferRoom: cap(false, inventoryBlockReason),
        canMoveBed: cap(false, inventoryBlockReason),
        canMergeResidency: cap(false, inventoryBlockReason),
        canGenerateCheckout: cap(false, 'Checkout already approved'),
        canRequestRefund: cap(false, 'Refund request already in pipeline'),
        canArchive: cap(false),
        canEditVacating: cap(false, 'Checkout approved — vacating locked'),
      };

    case 'refund_pending':
      return {
        canTransferRoom: cap(false, inventoryBlockReason),
        canMoveBed: cap(false, inventoryBlockReason),
        canMergeResidency: cap(false, inventoryBlockReason),
        canGenerateCheckout: cap(false, 'Checkout settlement complete'),
        canRequestRefund: cap(false, 'Refund payout pending'),
        canArchive: cap(false),
        canEditVacating: cap(false, 'Refund pending'),
      };

    case 'refund_completed':
      return {
        canTransferRoom: cap(false, 'Bed not released until move-out finalized'),
        canMoveBed: cap(false, 'Bed not released until move-out finalized'),
        canMergeResidency: cap(false, 'Awaiting move-out finalization'),
        canGenerateCheckout: cap(false, 'Checkout complete'),
        canRequestRefund: cap(false, 'Refund paid'),
        canArchive: cap(true),
        canEditVacating: cap(false, 'Refund completed'),
      };

    case 'archived':
      return {
        canTransferRoom: cap(true),
        canMoveBed: cap(true),
        canMergeResidency: cap(true),
        canGenerateCheckout: cap(false, 'Move-out archived'),
        canRequestRefund: cap(false, 'Move-out archived'),
        canArchive: cap(false, 'Already archived'),
        canEditVacating: cap(false, 'Move-out archived'),
      };

    default:
      return deriveExitBrainCapabilities('inactive', input);
  }
}

export function buildExitBrainLifecycle(input: ExitBrainStateMachineInput): ExitBrainLifecycle {
  const state = resolveExitBrainLifecycleState(input);
  const penaltiesFrozen = input.exitBrainStatus === 'active';
  const capabilities = deriveExitBrainCapabilities(state, input);

  return {
    state,
    stateLabel: exitBrainLifecycleStateLabel(state),
    capabilities,
    penaltiesFrozen,
    isExitMode: penaltiesFrozen,
  };
}

/** Map lifecycle state to legacy operational phase for timeline / queue display. */
export function lifecycleStateToPhase(state: ExitBrainLifecycleState): import('@/src/lib/exit/exitBrainPhase').ExitBrainPhase {
  switch (state) {
    case 'inactive':
      return 'inactive';
    case 'notice_submitted':
      return 'notice_submitted';
    case 'notice_approved':
      return 'notice_approved';
    case 'exit_active':
      return 'room_inspection';
    case 'checkout_pending':
      return 'waiting_meter';
    case 'checkout_completed':
      return 'settlement_ready';
    case 'refund_pending':
      return 'waiting_refund';
    case 'refund_completed':
      return 'refund_completed';
    case 'archived':
      return 'completed';
    default:
      return 'inactive';
  }
}

export function projectionInputToStateMachineInput(
  projection: ExitBrainProjectionInput,
  extras: {
    hasSettlement: boolean;
    refundRequestEligible?: boolean;
  },
): ExitBrainStateMachineInput {
  return {
    ...projection,
    hasSettlement: extras.hasSettlement,
    refundRequestEligible: extras.refundRequestEligible,
  };
}
