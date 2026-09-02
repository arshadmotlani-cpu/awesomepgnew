/**
 * Canonical self-service room-change workflow.
 *
 * Request status, invoices, holds and allocations are separate facts. This
 * state is the orchestration state that says which transitions are legal.
 */

export const ROOM_CHANGE_HOLD_HOURS = 72;
export const ROOM_CHANGE_QUOTE_VERSION = 1;

export const ROOM_CHANGE_WORKFLOW_STATES = [
  'REQUESTED',
  'QUOTED',
  'TARGET_HELD',
  'PAYMENT_PENDING',
  'READY_TO_TRANSFER',
  'TRANSFERRING',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
] as const;

export type RoomChangeWorkflowState = (typeof ROOM_CHANGE_WORKFLOW_STATES)[number];

export const ROOM_CHANGE_TERMINAL_STATES = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
] as const satisfies readonly RoomChangeWorkflowState[];

const ALLOWED_TRANSITIONS: Readonly<Record<RoomChangeWorkflowState, readonly RoomChangeWorkflowState[]>> = {
  REQUESTED: ['QUOTED', 'CANCELLED', 'FAILED'],
  QUOTED: ['TARGET_HELD', 'CANCELLED', 'FAILED'],
  TARGET_HELD: ['PAYMENT_PENDING', 'READY_TO_TRANSFER', 'CANCELLED', 'EXPIRED', 'FAILED'],
  PAYMENT_PENDING: ['READY_TO_TRANSFER', 'CANCELLED', 'EXPIRED', 'FAILED'],
  READY_TO_TRANSFER: ['TRANSFERRING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  TRANSFERRING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: [],
};

export function isRoomChangeTerminal(state: RoomChangeWorkflowState): boolean {
  return (ROOM_CHANGE_TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransitionRoomChange(
  from: RoomChangeWorkflowState,
  to: RoomChangeWorkflowState,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertRoomChangeTransition(
  from: RoomChangeWorkflowState,
  to: RoomChangeWorkflowState,
): void {
  if (!canTransitionRoomChange(from, to)) {
    throw new Error(`Invalid room-change transition: ${from} → ${to}`);
  }
}

export function roomChangeExpiresAt(heldAt: Date): Date {
  return new Date(heldAt.getTime() + ROOM_CHANGE_HOLD_HOURS * 60 * 60 * 1000);
}

export function roomChangeDeadlinePassed(expiresAt: Date, now = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/**
 * A delayed webhook/job may complete after the deadline only when the
 * authoritative settlement timestamp itself was within the 72-hour window.
 */
export function settlementMetRoomChangeDeadline(
  settledAt: Date | null | undefined,
  expiresAt: Date,
): boolean {
  return Boolean(settledAt && settledAt.getTime() <= expiresAt.getTime());
}
