export { buildRoomSharedSnapshot } from '@/src/roomOs/engines/electricity/buildRoomShared';
export {
  mapRoomBillingModeToSnapshot,
  resolveElectricityStatusFromLedger,
  resolveMeterReadingStateForMonth,
} from '@/src/roomOs/engines/electricity/resolveRoomElectricityFacts';
export {
  isRoomAwaitingElectricityBillGeneration,
  nextElectricityBillStatusLabel,
  resolveNextElectricityBillStatus,
  residentElectricityPendingMessage,
} from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';
export {
  buildRoomElectricitySettlementSnapshot,
  type RoomElectricitySettlementSnapshot,
  type RoomElectricityResidentSettlementRow,
} from '@/src/roomOs/engines/electricity/buildRoomElectricitySettlement';
