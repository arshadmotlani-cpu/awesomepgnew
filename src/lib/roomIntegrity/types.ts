export type RoomIntegrityIssueCode =
  | 'capacity_physical_mismatch'
  | 'bookable_physical_mismatch'
  | 'occupied_exceeds_capacity'
  | 'occupied_exceeds_physical'
  | 'sharing_label_mismatch';

export type RoomIntegrityIssue = {
  code: RoomIntegrityIssueCode;
  message: string;
};

/** Read-only snapshot of one room's inventory state. */
export type RoomIntegritySnapshot = {
  roomId: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  roomTypeName: string;
  /** room_types.default_capacity */
  storedCapacity: number;
  /** Non-archived beds in room. */
  physicalBeds: number;
  /** beds.status = available */
  bookableBeds: number;
  /** beds.status = blocked */
  blockedBeds: number;
  /** beds.status = maintenance (disabled) */
  maintenanceBeds: number;
  /** Active confirmed primary residents today. */
  occupiedBeds: number;
};

export type RoomIntegrityResult = RoomIntegritySnapshot & {
  issues: RoomIntegrityIssue[];
  hasMismatch: boolean;
};

export type PgRoomIntegrityReport = {
  pgId: string;
  pgName: string;
  roomsScanned: number;
  roomsWithIssues: number;
  rooms: RoomIntegrityResult[];
};

export type AllPgsRoomIntegrityReport = {
  generatedAt: string;
  pgsScanned: number;
  totalRooms: number;
  totalRoomsWithIssues: number;
  reports: PgRoomIntegrityReport[];
};
