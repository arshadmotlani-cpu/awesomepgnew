/**
 * Room OS domain types — Wave 0 foundation.
 * Snapshots are materialized projections (truth level 3), not write truth.
 */

/** Truth ladder levels — see docs/ROOM_OS.md */
export const TRUTH_LEVELS = {
  LEDGER_WRITE: 1,
  DOMAIN_EVENT: 2,
  MATERIALIZED_PROJECTION: 3,
  TIMELINE_DISPLAY: 4,
} as const;

export type TruthLevel = (typeof TRUTH_LEVELS)[keyof typeof TRUTH_LEVELS];

export type RoomOsStreamType = 'property' | 'room' | 'bed' | 'booking';

/** Append-only domain event envelope (Layer A). */
export type RoomOsEventEnvelope<TPayload = Record<string, unknown>> = {
  eventId: string;
  streamType: RoomOsStreamType;
  streamId: string;
  eventType: string;
  occurredAt: string;
  recordedAt: string;
  rulesEffectivePackId: string;
  payload: TPayload;
  sourceRef: string;
};

/** Stored at projection materialize time — Wave 4 explain assembles from these. */
export type DerivationRef = {
  stepId: string;
  engine: string;
  ruleId?: string;
  inputDigest: string;
  outputDigest: string;
};

/** Booking-scoped money/residency slice — value object inside Bed Brain, not a fourth aggregate. */
export type BookingContextSlice = {
  bookingId: string;
  bedId: string;
  pgId: string;
  residencyStatus: 'active' | 'vacating' | 'completed' | 'none';
  rentInvoicePointer?: string;
  depositPointer?: string;
  moveOutPointer?: string;
  derivationRefs: DerivationRef[];
};

export type BedBrainSnapshot = {
  bedId: string;
  roomId: string;
  pgId: string;
  asOf: string;
  bookingContext: BookingContextSlice | null;
  computedAt: string;
  snapshotVersion: number;
};

export type RoomOsSharedSnapshot = {
  roomId: string;
  pgId: string;
  billingMonth: string;
  asOf: string;
  billingMode: 'monthly' | 'checkout' | 'unknown';
  meterReadingState: 'current' | 'stale' | 'missing';
  electricityStatus: string;
  electricityStatusReason?: string;
  computedAt: string;
  snapshotVersion: number;
  derivationRefs: DerivationRef[];
};

export type KpiStripSnapshot = {
  pgId: string;
  billingMonth: string;
  proofsPending: number;
  overdueRent: number;
  rentDueToday: number;
  electricityIncomplete: number;
  moveOutsPending: number;
  computedAt: string;
};

export type WorkQueueBucket =
  | 'proofs'
  | 'overdue_rent'
  | 'rent_today'
  | 'electricity'
  | 'move_out'
  | 'day_close';

export type WorkQueueItem = {
  id: string;
  bucket: WorkQueueBucket;
  priority: number;
  title: string;
  entityType: 'booking' | 'room' | 'bed' | 'invoice';
  entityId: string;
  pgId: string;
  roomId?: string;
  bedId?: string;
  bookingId?: string;
  reasonCode?: string;
};

export type WorkQueueSnapshot = {
  pgId: string;
  billingMonth: string;
  items: WorkQueueItem[];
  computedAt: string;
  contentHash: string;
};

/** Single hot read model for Operations Centre — Wave 1 materialization target. */
export type PropertyOsIndexSnapshot = {
  pgId: string;
  billingMonth: string;
  asOf: string;
  kpiStrip: KpiStripSnapshot;
  workQueueSummary: Pick<WorkQueueSnapshot, 'contentHash' | 'computedAt'> & {
    totalItems: number;
    bucketCounts: Partial<Record<WorkQueueBucket, number>>;
  };
  roomIndex: Array<{
    roomId: string;
    label: string;
    occupancySummary: string;
    electricityStatus: string;
  }>;
  electricityProgress: {
    complete: number;
    incomplete: number;
    blocked: number;
  };
  computedAt: string;
  snapshotVersion: number;
};
