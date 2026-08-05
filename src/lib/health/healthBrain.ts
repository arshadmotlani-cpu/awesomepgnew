/**
 * Health Brain — unified issue model + aggregate integrity audits + safe repairs.
 */

import { db } from '@/src/db/client';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { logger } from '@/src/lib/logger';
import { formatDate } from '@/src/lib/dates';
import { runBookingBrainIntegrityAudit, repairStaleDraftReservesWithoutHold } from '@/src/lib/health/bookingBrainIntegrity';
import { runFinanceBrainIntegrityAudit } from '@/src/lib/health/financeBrainIntegrity';
import { runOperationsBrainIntegrityAudit } from '@/src/lib/health/operationsBrainIntegrity';

export type HealthBrainName =
  | 'Resident'
  | 'Booking'
  | 'Finance'
  | 'Electricity'
  | 'Operations'
  | 'Health';

export type HealthIssueSeverity = 'P0' | 'P1' | 'P2';

export type HealthIssueStatus =
  | 'open'
  | 'repair_available'
  | 'repair_running'
  | 'repaired'
  | 'healthy';

export type HealthIssue = {
  id: string;
  severity: HealthIssueSeverity;
  brain: HealthBrainName;
  entityType: string;
  entityId: string | null;
  code: string;
  cause: string;
  suggestedRepair: string;
  autoRepairAvailable: boolean;
  status: HealthIssueStatus;
};

export type BrainCardStatus = 'Healthy' | 'Warning' | 'Critical';

export type BrainCardSummary = {
  brain: HealthBrainName;
  status: BrainCardStatus;
  openP0: number;
  openP1: number;
  openP2: number;
  issueCount: number;
  href: string;
};

export type AllBrainIntegrityReport = {
  asOf: string;
  billingMonth: string;
  issues: HealthIssue[];
  cards: BrainCardSummary[];
  pass: boolean;
  repairs?: {
    orphanReservesCancelled: string[];
    staleDraftsCancelled: string[];
  };
};

function firstOfMonthIso(d = new Date()): string {
  return `${formatDate(d).slice(0, 7)}-01`;
}

function cardStatus(p0: number, p1: number, p2: number): BrainCardStatus {
  if (p0 > 0) return 'Critical';
  if (p1 > 0) return 'Warning';
  if (p2 > 0) return 'Warning';
  return 'Healthy';
}

function issueId(brain: HealthBrainName, code: string, entityId: string | null): string {
  return `${brain}:${code}:${entityId ?? 'none'}`;
}

export async function alertHealthBrainIncident(input: {
  severity?: HealthIssueSeverity;
  brain: HealthBrainName;
  code: string;
  entityType: string;
  entityId: string | null;
  cause: string;
  source?: string;
}): Promise<void> {
  const severity = input.severity ?? 'P0';
  const payload = {
    brain: input.brain,
    event: 'health.incident.opened',
    severity,
    code: input.code,
    entityType: input.entityType,
    entityId: input.entityId,
    cause: input.cause,
    source: input.source ?? 'health_brain',
  };
  logger.error('health.incident.opened', payload);
  if (!input.entityId) return;
  await writeAuditLogNonBlocking(db, {
    actorType: 'system',
    actorId: null,
    action: 'health.incident.opened',
    entity: input.entityType,
    entityId: input.entityId,
    diff: payload,
  }).catch(() => undefined);
}

export async function runAllBrainIntegrityAudits(opts?: {
  billingMonth?: string;
  runSafeRepairs?: boolean;
  /** Persist P0 incidents to audit_log (cron / explicit). Off for UI cards. */
  persistIncidents?: boolean;
}): Promise<AllBrainIntegrityReport> {
  const billingMonth = opts?.billingMonth ?? firstOfMonthIso();
  const issues: HealthIssue[] = [];

  const [
    resident,
    electricity,
    operations,
    booking,
    finance,
  ] = await Promise.all([
    import('@/src/lib/residents/residentBrainIntegrity').then((m) =>
      m.runResidentBrainIntegrityAudit({ currentMonth: billingMonth }),
    ),
    import('@/src/lib/billing/electricityReadingsWithoutBills').then((m) =>
      m.runElectricityReadingsWithoutBillsAudit({ billingMonth }),
    ),
    runOperationsBrainIntegrityAudit(),
    runBookingBrainIntegrityAudit(),
    runFinanceBrainIntegrityAudit(),
  ]);

  for (const f of resident.findings) {
    issues.push({
      id: issueId('Resident', f.code, f.customerId),
      severity: f.severity,
      brain: 'Resident',
      entityType: 'customer',
      entityId: f.customerId,
      code: f.code,
      cause: f.detail,
      suggestedRepair: f.repairable
        ? 'Cancel orphan reserve blocking active stay'
        : 'Manual investigation — do not auto-generate bills',
      autoRepairAvailable: f.repairable,
      status: f.repairable ? 'repair_available' : 'open',
    });
  }

  for (const f of electricity.findings) {
    issues.push({
      id: issueId('Electricity', f.code, f.roomId),
      severity: f.severity,
      brain: 'Electricity',
      entityType: 'room',
      entityId: f.roomId,
      code: f.code,
      cause: f.detail,
      suggestedRepair: 'Detect only — do not invent electricity bills from Health',
      autoRepairAvailable: false,
      status: 'open',
    });
  }

  for (const f of operations.findings) {
    issues.push({
      id: issueId('Operations', f.code, f.entityId),
      severity: f.severity,
      brain: 'Operations',
      entityType: f.entityType,
      entityId: f.entityId,
      code: f.code,
      cause: f.detail,
      suggestedRepair: 'Excluded from Operations queue automatically',
      autoRepairAvailable: true,
      status: 'repair_available',
    });
  }

  for (const f of booking.findings) {
    issues.push({
      id: issueId('Booking', f.code, f.entityId),
      severity: f.severity,
      brain: 'Booking',
      entityType: f.entityType,
      entityId: f.entityId,
      code: f.code,
      cause: f.detail,
      suggestedRepair: f.repairable
        ? 'Cancel stale draft reserve (≥14d) with no hold'
        : 'Manual booking/bed repair',
      autoRepairAvailable: f.repairable,
      status: f.repairable ? 'repair_available' : 'open',
    });
  }

  for (const f of finance.findings) {
    issues.push({
      id: issueId('Finance', f.code, f.entityId),
      severity: f.severity,
      brain: 'Finance',
      entityType: f.entityType,
      entityId: f.entityId,
      code: f.code,
      cause: f.detail,
      suggestedRepair: 'Manual finance reconciliation',
      autoRepairAvailable: false,
      status: 'open',
    });
  }

  // Health brain = meta issues (P0 open across brains)
  const openP0 = issues.filter((i) => i.severity === 'P0');
  if (opts?.persistIncidents || opts?.runSafeRepairs) {
    for (const i of openP0.slice(0, 20)) {
      await alertHealthBrainIncident({
        severity: 'P0',
        brain: 'Health',
        code: i.code,
        entityType: i.entityType,
        entityId: i.entityId,
        cause: `[${i.brain}] ${i.cause}`,
        source: 'runAllBrainIntegrityAudits',
      });
    }
  }

  if (openP0.length > 0) {
    issues.push({
      id: issueId('Health', 'OPEN_P0_AGGREGATE', null),
      severity: 'P0',
      brain: 'Health',
      entityType: 'health_brain',
      entityId: null,
      code: 'OPEN_P0_AGGREGATE',
      cause: `${openP0.length} open P0 issue(s) across brains`,
      suggestedRepair: 'Run safe repairs + investigate remaining P0s',
      autoRepairAvailable: true,
      status: 'open',
    });
  }

  let repairs: AllBrainIntegrityReport['repairs'];
  if (opts?.runSafeRepairs) {
    const { repairOrphanReservesBlockingActiveStay } = await import(
      '@/src/lib/residents/residentBrainIntegrity'
    );
    const orphan = await repairOrphanReservesBlockingActiveStay();
    const stale = await repairStaleDraftReservesWithoutHold();
    repairs = {
      orphanReservesCancelled: orphan.cancelledBookingIds,
      staleDraftsCancelled: stale.cancelledBookingIds,
    };
  }

  const brains: HealthBrainName[] = [
    'Resident',
    'Booking',
    'Finance',
    'Electricity',
    'Operations',
    'Health',
  ];
  const cards: BrainCardSummary[] = brains.map((brain) => {
    const subset = issues.filter((i) => i.brain === brain);
    const p0 = subset.filter((i) => i.severity === 'P0').length;
    const p1 = subset.filter((i) => i.severity === 'P1').length;
    const p2 = subset.filter((i) => i.severity === 'P2').length;
    return {
      brain,
      status: cardStatus(p0, p1, p2),
      openP0: p0,
      openP1: p1,
      openP2: p2,
      issueCount: subset.length,
      href: `/admin/system/health-report?brain=${encodeURIComponent(brain)}`,
    };
  });

  const pass = !issues.some((i) => i.severity === 'P0');
  return {
    asOf: new Date().toISOString(),
    billingMonth,
    issues,
    cards,
    pass,
    repairs,
  };
}

/** Safe auto-repair registry entries (Wave 1). */
export const HEALTH_BRAIN_SAFE_REPAIRS = [
  {
    id: 'repairOrphanReservesBlockingActiveStay',
    auto: true,
    description: 'Cancel orphan draft/pending reserves blocking an active stay (no hold)',
  },
  {
    id: 'excludeInvalidPaymentReviews',
    auto: true,
    description: 'Exclude invalid payment reviews from Operations queue',
  },
  {
    id: 'repairStaleDraftReservesWithoutHold',
    auto: true,
    description: 'Cancel draft+reserve with no hold aged ≥14 days',
  },
  {
    id: 'repairMissingBills',
    auto: false,
    description: 'Do not invent rent/electricity bills from Health',
  },
] as const;
