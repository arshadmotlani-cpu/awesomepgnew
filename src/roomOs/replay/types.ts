/**
 * Replay Engine types — Wave 4 conditional read-only replay.
 */

export type ReplayScope = {
  pgId: string;
  billingMonth?: string;
  asOf?: string;
  sampleSize?: number;
};

export type EventCoverageReport = {
  pgId: string;
  billingMonth: string;
  processed: number;
  pending: number;
  failedRetryable: number;
  deadLetter: number;
  ratio: number;
  eligible: boolean;
  writerHooksInstrumented: number;
};

export type ReplaySampleResult = {
  eventId: string;
  eventType: string;
  sourceRef: string;
  matches: boolean;
  mismatches: string[];
  dryRunContentHash: string;
  materializedContentHash: string;
};

export type ReplayReport = {
  contractVersion: 'replay/v1';
  scope: ReplayScope;
  status: 'ready' | 'skipped' | 'not_found';
  skipReason?: string;
  coverage: EventCoverageReport;
  samples: ReplaySampleResult[];
  passCount: number;
  failCount: number;
  computedAt: string;
};
