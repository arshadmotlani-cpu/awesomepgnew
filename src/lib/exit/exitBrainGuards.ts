/**
 * Resident Exit Brain — guards driven by lifecycle capabilities (not raw status strings).
 */
import type { AdminSession } from '@/src/lib/auth/session';
import { adminHasPermission, type AdminRole } from '@/src/lib/auth/roles';
import { loadExitBrainLifecycleForBooking } from '@/src/lib/exit/loadExitBrainLifecycle';
import type { ExitBrainCapabilityKey } from '@/src/lib/exit/exitBrainStateMachine';

export type ExitBrainBlockedAction =
  | 'change_bed'
  | 'room_transfer'
  | 'merge_booking'
  | 'inventory_override';

const ACTION_CAPABILITY: Record<ExitBrainBlockedAction, ExitBrainCapabilityKey> = {
  change_bed: 'canMoveBed',
  room_transfer: 'canTransferRoom',
  merge_booking: 'canMergeResidency',
  inventory_override: 'canMoveBed',
};

const ACTION_LABELS: Record<ExitBrainBlockedAction, string> = {
  change_bed: 'Change bed or move resident',
  room_transfer: 'Room transfer',
  merge_booking: 'Merge booking',
  inventory_override: 'Inventory override',
};

export type ExitBrainGuardResult =
  | { ok: true }
  | { ok: false; reason: string; bookingId: string };

export function adminRoleCanOverrideExitLock(role: AdminRole): boolean {
  return adminHasPermission(role, 'bookings:override_exit_lock');
}

export function adminCanOverrideExitLock(session: AdminSession): boolean {
  return adminRoleCanOverrideExitLock(session.role);
}

/** @deprecated Use loadExitBrainLifecycleForBooking().isExitMode */
export async function isBookingInExitMode(bookingId: string): Promise<boolean> {
  const lifecycle = await loadExitBrainLifecycleForBooking(bookingId);
  return lifecycle.isExitMode;
}

export async function assertBookingExitOperationsAllowed(input: {
  bookingId: string;
  action: ExitBrainBlockedAction;
  session?: AdminSession | null;
  adminRole?: AdminRole | null;
}): Promise<ExitBrainGuardResult> {
  const lifecycle = await loadExitBrainLifecycleForBooking(input.bookingId);
  const capabilityKey = ACTION_CAPABILITY[input.action];
  const capability = lifecycle.capabilities[capabilityKey];

  if (capability.allowed) return { ok: true };

  const role = input.adminRole ?? input.session?.role;
  if (role && adminRoleCanOverrideExitLock(role)) {
    return { ok: true };
  }

  const label = ACTION_LABELS[input.action];
  return {
    ok: false,
    bookingId: input.bookingId,
    reason: capability.reason ?? `${label} is not allowed in ${lifecycle.stateLabel}.`,
  };
}

export async function assertExitCapabilityAllowed(input: {
  bookingId: string;
  capability: ExitBrainCapabilityKey;
  session?: AdminSession | null;
  adminRole?: AdminRole | null;
}): Promise<ExitBrainGuardResult> {
  const lifecycle = await loadExitBrainLifecycleForBooking(input.bookingId);
  const capability = lifecycle.capabilities[input.capability];

  if (capability.allowed) return { ok: true };

  const role = input.adminRole ?? input.session?.role;
  if (
    role &&
    adminRoleCanOverrideExitLock(role) &&
    (input.capability === 'canMoveBed' ||
      input.capability === 'canTransferRoom' ||
      input.capability === 'canMergeResidency')
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    bookingId: input.bookingId,
    reason: capability.reason ?? `Not allowed in ${lifecycle.stateLabel}.`,
  };
}
