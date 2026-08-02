/**
 * Certification Engine types — Room OS Wave 2 release gate.
 */

export const CERTIFICATION_CONTRACT_VERSION = '1.0.0' as const;

export type CertificationSeverity = 'pass' | 'warning' | 'fail';

export type CertificationDomain =
  | 'property_index'
  | 'work_queue'
  | 'occupancy'
  | 'electricity'
  | 'ledger'
  | 'portal'
  | 'kpi'
  | 'replay';

export type CertificationFinding = {
  checkId: string;
  domain: CertificationDomain;
  severity: CertificationSeverity;
  message: string;
  expected?: string;
  actual?: string;
  context?: Record<string, unknown>;
};

export type CertificationOverallStatus = 'pass' | 'warning' | 'fail';

export type CertificationReport = {
  reportId: string;
  contractVersion: typeof CERTIFICATION_CONTRACT_VERSION;
  suiteId: string;
  pgId: string;
  pgName: string | null;
  billingMonth: string;
  asOf: string;
  computedAt: string;
  status: CertificationOverallStatus;
  findings: CertificationFinding[];
  summary: {
    passCount: number;
    warningCount: number;
    failCount: number;
    totalChecks: number;
    shantinagarResidents?: {
      total: number;
      passed: number;
      failed: number;
      certified: boolean;
    };
  };
};

export type CertificationScope = {
  pgId: string;
  billingMonth?: string;
  asOf?: string;
  suiteId?: string;
  requestedAt: string;
};

export type CertificationErrorCode =
  | 'INVALID_SCOPE'
  | 'PG_NOT_FOUND'
  | 'CERTIFICATION_UNAVAILABLE';

export type CertificationError = {
  code: CertificationErrorCode;
  message: string;
};

export type CertificationCheckContext = {
  pgId: string;
  pgName: string | null;
  billingMonth: string;
  asOf: string;
};
