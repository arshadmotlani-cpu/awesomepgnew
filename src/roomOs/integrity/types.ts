/**
 * Integrity Engine types — ADR-OR-001 Preflight contract v1.
 */

export const INTEGRITY_CONTRACT_VERSION = '1.0.0' as const;

export const PREFLIGHT_SCENARIOS = [
  'ROLLBACK_VACATING',
  'REACTIVATE_BOOKING',
  'RENT_ONLY_ONBOARDING',
  'REGENERATE_ELECTRICITY',
  'REPAIR_OCCUPANCY',
  'ROOM_TRANSFER',
] as const;

export type PreflightScenario = (typeof PREFLIGHT_SCENARIOS)[number];

export type PreflightLinkedPayment = {
  kind: string;
  entityId: string;
};

export type PreflightConstraints = {
  depositAlreadyHeld?: boolean;
};

export type PreflightScope = {
  pgId: string;
  scenario: PreflightScenario;
  bookingId?: string;
  customerId?: string;
  roomId?: string;
  bedId?: string;
  billingMonth?: string;
  linkedPayment?: PreflightLinkedPayment;
  constraints?: PreflightConstraints;
  requestedAt: string;
};

export type IntegritySeverity = 'block' | 'warn';

export type DuplicateKind =
  | 'rent_invoice'
  | 'electricity_invoice'
  | 'deposit_ledger'
  | 'primary_reservation'
  | 'residency_open'
  | 'checkout_settlement';

export type InvariantKind =
  | 'occupancy'
  | 'deposit'
  | 'booking_status'
  | 'vacating'
  | 'electricity_paid_skip';

export type DuplicateFinding = {
  kind: DuplicateKind;
  severity: IntegritySeverity;
  entityIds: string[];
  naturalKey: string;
  reasonCode: string;
  description: string;
};

export type InvariantFinding = {
  kind: InvariantKind;
  severity: IntegritySeverity;
  reasonCode: string;
  description: string;
  context: Record<string, unknown>;
};

export type IntegrityFinding = {
  severity: IntegritySeverity;
  reasonCode: string;
  description: string;
  context?: Record<string, unknown>;
};

export type IntegrityPreflightReport = {
  reportId: string;
  contractVersion: typeof INTEGRITY_CONTRACT_VERSION;
  rulePackId: string;
  rulePackDigest: string;
  scopeDigest: string;
  computedAt: string;
  blocked: boolean;
  blockReasons: string[];
  duplicates: DuplicateFinding[];
  invariants: InvariantFinding[];
  warnings: IntegrityFinding[];
  summary: {
    duplicateCount: number;
    invariantCount: number;
    warningCount: number;
    blockCount: number;
    warnCount: number;
  };
};

export type PreflightErrorCode =
  | 'INVALID_SCOPE'
  | 'UNKNOWN_SCENARIO'
  | 'PG_NOT_FOUND'
  | 'SCOPE_MISMATCH'
  | 'PREFLIGHT_UNAVAILABLE'
  | 'RULE_EVALUATION_FAILED';

export type PreflightError = {
  code: PreflightErrorCode;
  message: string;
};

export type PreflightCheckContext = {
  scope: PreflightScope;
  scenario: PreflightScenario;
};
