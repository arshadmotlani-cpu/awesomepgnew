/**
 * Vehicle Lifecycle SSOT (ADR-017).
 *
 * State answers: "What is happening with this vehicle right now?"
 * Activities answer: "What events happened during its lifecycle?"
 *
 * Reuses existing `ac_asset_status` enum — no new DB values in this pass.
 */

import type { VehicleActivityType } from '@/src/capital/lib/activityTypes';

export const ASSET_STATUSES = [
  'purchased',
  'repairing',
  'painting',
  'ready',
  'listed',
  'sold',
  'settled',
  'cancelled',
] as const;

export type AssetLifecycleStatus = (typeof ASSET_STATUSES)[number];

export type LifecycleGroup =
  | 'just_purchased'
  | 'under_repair'
  | 'ready_for_sale'
  | 'listed'
  | 'sold'
  | 'settled'
  | 'archived';

export type LifecycleStateMeta = {
  status: AssetLifecycleStatus;
  /** Dealer-facing label */
  label: string;
  group: LifecycleGroup;
  /** Group heading for boards / filters */
  groupLabel: string;
  isActive: boolean;
  isTerminal: boolean;
};

export const LIFECYCLE_STATES: Record<AssetLifecycleStatus, LifecycleStateMeta> = {
  purchased: {
    status: 'purchased',
    label: 'Just Purchased',
    group: 'just_purchased',
    groupLabel: 'Just Purchased',
    isActive: true,
    isTerminal: false,
  },
  repairing: {
    status: 'repairing',
    label: 'Under Repair',
    group: 'under_repair',
    groupLabel: 'Under Repair',
    isActive: true,
    isTerminal: false,
  },
  painting: {
    status: 'painting',
    label: 'Under Repair (Painting)',
    group: 'under_repair',
    groupLabel: 'Under Repair',
    isActive: true,
    isTerminal: false,
  },
  ready: {
    status: 'ready',
    label: 'Ready For Sale',
    group: 'ready_for_sale',
    groupLabel: 'Ready For Sale',
    isActive: true,
    isTerminal: false,
  },
  listed: {
    status: 'listed',
    label: 'Listed For Sale',
    group: 'listed',
    groupLabel: 'Listed For Sale',
    isActive: true,
    isTerminal: false,
  },
  sold: {
    status: 'sold',
    label: 'Sold',
    group: 'sold',
    groupLabel: 'Sold',
    isActive: false,
    isTerminal: false,
  },
  settled: {
    status: 'settled',
    label: 'Settled',
    group: 'settled',
    groupLabel: 'Settled',
    isActive: false,
    isTerminal: true,
  },
  cancelled: {
    status: 'cancelled',
    label: 'Archived',
    group: 'archived',
    groupLabel: 'Archived',
    isActive: false,
    isTerminal: true,
  },
};

/** Manual / UI transitions (sale → sold and settle → settled use dedicated workflows). */
const TRANSITIONS: Record<AssetLifecycleStatus, AssetLifecycleStatus[]> = {
  purchased: ['repairing', 'painting', 'ready', 'cancelled'],
  repairing: ['painting', 'ready', 'cancelled'],
  painting: ['repairing', 'ready', 'cancelled'],
  ready: ['listed', 'repairing', 'painting', 'cancelled'],
  listed: ['ready', 'repairing', 'cancelled'],
  sold: [], // settle via settlement workflow
  settled: [],
  cancelled: [],
};

export function isAssetLifecycleStatus(value: string): value is AssetLifecycleStatus {
  return (ASSET_STATUSES as readonly string[]).includes(value);
}

export function lifecycleLabel(status: string): string {
  if (isAssetLifecycleStatus(status)) return LIFECYCLE_STATES[status].label;
  return status.replace(/_/g, ' ');
}

export function lifecycleGroupLabel(status: string): string {
  if (isAssetLifecycleStatus(status)) return LIFECYCLE_STATES[status].groupLabel;
  return lifecycleLabel(status);
}

export function allowedTransitions(from: string): AssetLifecycleStatus[] {
  if (!isAssetLifecycleStatus(from)) return [];
  return [...TRANSITIONS[from]];
}

export function canTransition(from: string, to: string): boolean {
  if (!isAssetLifecycleStatus(from) || !isAssetLifecycleStatus(to)) return false;
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/**
 * Auto-apply status after certain activities.
 * Rule: repair_advance → repairing only when current ∈ {purchased, painting}.
 */
export function autoStatusOnActivity(
  currentStatus: string,
  activityType: VehicleActivityType | string,
): AssetLifecycleStatus | null {
  if (activityType === 'repair_advance') {
    if (currentStatus === 'purchased' || currentStatus === 'painting') {
      return 'repairing';
    }
  }
  return null;
}

/**
 * Suggested next status after an activity (dealer must confirm — never auto for Ready).
 */
export function suggestTransitionOnActivity(
  currentStatus: string,
  activityType: VehicleActivityType | string,
): AssetLifecycleStatus | null {
  const auto = autoStatusOnActivity(currentStatus, activityType);
  if (auto) return auto;

  if (activityType === 'repair_settlement') {
    if (
      currentStatus === 'repairing' ||
      currentStatus === 'painting' ||
      currentStatus === 'purchased'
    ) {
      return 'ready';
    }
  }
  return null;
}

export type DerivedBadge = {
  id: 'purchase_pending';
  label: string;
};

/**
 * Purchase Pending = Just Purchased AND payment milestones have not covered purchase price.
 * Not a separate enum — derived badge only (ADR-017 Phase 2 may promote to enum).
 */
export function derivedBadges(input: {
  status: string;
  purchasePricePaise: number;
  milestonesPaidPaise: number;
  fundingGapPaise?: number;
}): DerivedBadge[] {
  const badges: DerivedBadge[] = [];
  if (input.status !== 'purchased') return badges;

  const milestonesShort =
    input.purchasePricePaise > 0 && input.milestonesPaidPaise < input.purchasePricePaise;
  const fundingShort = (input.fundingGapPaise ?? 0) > 0;

  if (milestonesShort || fundingShort) {
    badges.push({ id: 'purchase_pending', label: 'Purchase Pending' });
  }
  return badges;
}

/** Statuses shown as manual next-step chips on Overview (excludes sold/settled/cancelled). */
export function manualLifecycleTargets(from: string): AssetLifecycleStatus[] {
  return allowedTransitions(from).filter((s) => s !== 'cancelled');
}

export function canArchive(status: string): boolean {
  return allowedTransitions(status).includes('cancelled');
}
