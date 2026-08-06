export type { ResidentExitBrainSnapshot, ExitRefundEstimate, ExitRefundEstimateLine } from '@/src/lib/exit/exitBrainTypes';
export type { ExitBrainPhase } from '@/src/lib/exit/exitBrainPhase';
export type {
  ExitBrainLifecycleState,
  ExitBrainLifecycle,
  ExitBrainCapabilities,
  ExitBrainCapability,
  ExitBrainCapabilityKey,
} from '@/src/lib/exit/exitBrainStateMachine';
export type { ExitTimelineEvent } from '@/src/lib/exit/exitBrainTimeline';
export type { ExitChecklistItem } from '@/src/lib/exit/exitBrainChecklist';
export type { RoomExitQueueItem, RoomExitQueuesByRoomId } from '@/src/lib/exit/loadRoomExitQueue';
export { loadResidentExitBrainSnapshot, loadResidentExitBrainSnapshotForVacating, loadExitBrainBillingPresentation } from '@/src/lib/exit/loadResidentExitBrainSnapshot';
export { loadExitBrainLifecycleForBooking } from '@/src/lib/exit/loadExitBrainLifecycle';
export {
  activateResidentExitBrain,
  completeResidentExitBrain,
  deactivateResidentExitBrain,
  getActiveExitBrainForBooking,
  getExitBrainForBooking,
  getExitBrainFrozenRentLateFeeMap,
} from '@/src/lib/exit/activateResidentExitBrain';
export { buildExitRefundEstimate } from '@/src/lib/exit/exitBrainRefundEstimatePure';
export { resolveExitBrainPhase, exitBrainPhaseLabel } from '@/src/lib/exit/exitBrainPhase';
export {
  resolveExitBrainLifecycleState,
  deriveExitBrainCapabilities,
  buildExitBrainLifecycle,
  exitBrainLifecycleStateLabel,
  lifecycleStateToPhase,
  projectionInputToStateMachineInput,
  EXIT_BRAIN_LIFECYCLE_ORDER,
} from '@/src/lib/exit/exitBrainStateMachine';
export { buildExitBrainTimeline } from '@/src/lib/exit/exitBrainTimeline';
export { buildExitBrainChecklist } from '@/src/lib/exit/exitBrainChecklist';
export { computeExitRefundConfidence } from '@/src/lib/exit/exitBrainRefundConfidence';
export { loadRoomExitQueueForRoom, loadRoomExitQueuesForPg } from '@/src/lib/exit/loadRoomExitQueue';
export {
  assertBookingExitOperationsAllowed,
  assertExitCapabilityAllowed,
  isBookingInExitMode,
  adminRoleCanOverrideExitLock,
} from '@/src/lib/exit/exitBrainGuards';
export {
  resolveExitLifecycleFromSnapshot,
  isMoveOutLifecycleActive,
  isMoveOutLifecycleComplete,
  residentMoveOutStatusLabel,
  residentMoveOutHint,
  buildExitLifecycleFromBedVacating,
  isNoticeSubmittedState,
  isNoticeApprovedOrExitActive,
} from '@/src/lib/exit/exitBrainLifecycleUi';
export { initializeRoomBrainStack } from '@/src/lib/brains/initializeRoomBrainStack';
