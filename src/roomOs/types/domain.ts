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

/** Materialized-first read API status — distinguishes persisted vs live-computed snapshots. */
export type MaterializationStatus = 'ready' | 'not_materialized' | 'live_fallback';

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

/** Booking-scoped money projection — Wave 1 LedgerProjection live-read. */
export type BookingLedgerCategorySlice = {
  requiredPaise: number;
  receivedPaise: number;
  outstandingPaise: number;
  status: 'none' | 'current' | 'outstanding' | 'overdue';
};

export type BookingLedgerSnapshot = {
  bookingId: string;
  bookingCode: string;
  pgId: string;
  customerId: string;
  asOf: string;
  rent: BookingLedgerCategorySlice;
  electricity: BookingLedgerCategorySlice;
  deposit: BookingLedgerCategorySlice & { refundablePaise: number };
  totals: {
    requiredPaise: number;
    receivedPaise: number;
    outstandingPaise: number;
  };
  paymentState: 'clear' | 'proof_pending' | 'checkout_open';
  paymentStateReason?: string;
  checkoutSettlementStatus?: string | null;
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
  /** Wave 4 — derivation refs from WorkQueueProjector. */
  derivationRefs?: DerivationRef[];
};

/** Embedded in PropertyOsIndexSnapshot — WorkQueueProjector input (no engine reads). */
export type WorkQueueProjectionSource = {
  bookings: Array<{
    bookingId: string;
    bookingCode: string;
    customerId: string;
    paymentState: BookingLedgerSnapshot['paymentState'];
    paymentStateReason?: string;
    rentStatus: BookingLedgerCategorySlice['status'];
  }>;
  vacatingBeds: Array<{
    bedId: string;
    roomId: string;
    bookingId: string;
  }>;
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
  workQueueProjection: WorkQueueProjectionSource;
  roomIndex: Array<{
    roomId: string;
    label: string;
    occupancySummary: string;
    electricityStatus: string;
    electricityStatusReason?: string;
  }>;
  electricityProgress: {
    complete: number;
    incomplete: number;
    blocked: number;
  };
  computedAt: string;
  snapshotVersion: number;
  /** Wave 4 — aggregated derivation refs recorded at materialize time. */
  derivationRefs?: DerivationRef[];
};

/** Wave 6 — materialized business metrics rollup (truth level 3). */
export type PropertyMetricsRollup = {
  pgId: string;
  billingMonth: string;
  occupancySummary: string;
  proofsPending: number;
  overdueRent: number;
  rentDueToday: number;
  electricityIncomplete: number;
  moveOutsPending: number;
  electricityProgress: PropertyOsIndexSnapshot['electricityProgress'];
  totalWorkQueueItems: number;
  bucketCounts: Partial<Record<WorkQueueBucket, number>>;
};

export type RoomMetricsRollup = {
  roomId: string;
  label: string;
  occupancySummary: string;
  electricityStatus: string;
  electricityStatusReason?: string;
};

export type BookingMetricsRollup = {
  bookingId: string;
  bookingCode: string;
  paymentState: BookingLedgerSnapshot['paymentState'];
  paymentStateReason?: string;
  rentStatus: BookingLedgerCategorySlice['status'];
};

export type ResidentMetricsRollup = {
  customerId: string;
  bookingId: string;
  bookingCode: string;
  paymentState: BookingLedgerSnapshot['paymentState'];
  rentStatus: BookingLedgerCategorySlice['status'];
};

export type FinancialMetricsRollup = {
  billingMonth: string;
  operatingRevenuePaise: number;
  rentPrincipalPaise: number;
  lateFeePaise: number;
  electricityPaise: number;
  otherIncomePaise: number;
  depositCollectedPaise: number;
  depositRefundedPaise: number;
  netCashInflowPaise: number;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
};

export type EventMetricsRollup = {
  billingMonth: string;
  countsByType: Partial<Record<string, number>>;
  totalEvents: number;
};

export type BusinessMetricsSnapshot = {
  pgId: string;
  billingMonth: string;
  asOf: string;
  computedAt: string;
  contentHash: string;
  property: PropertyMetricsRollup;
  rooms: RoomMetricsRollup[];
  bookings: BookingMetricsRollup[];
  residents: ResidentMetricsRollup[];
  financial: FinancialMetricsRollup;
  eventCounts: EventMetricsRollup;
  derivationRefs: DerivationRef[];
};
