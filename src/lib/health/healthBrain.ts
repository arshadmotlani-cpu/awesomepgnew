/**
 * Health Brain — unified issue model + aggregate integrity audits + Repair Engine.
 */

import { db } from '@/src/db/client';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { logger } from '@/src/lib/logger';
import { formatDate } from '@/src/lib/dates';
import { runBookingBrainIntegrityAudit } from '@/src/lib/health/bookingBrainIntegrity';
import { runFinanceBrainIntegrityAudit } from '@/src/lib/health/financeBrainIntegrity';
import { runOperationsBrainIntegrityAudit } from '@/src/lib/health/operationsBrainIntegrity';
import {
  computeHealthScore,
  dispatchSafeRepairs,
  enrichIssuesWithRepairMeta,
  upsertDurableIssues,
} from '@/src/lib/health/repairEngine';

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
  | 'healthy'
  | 'needs_owner'
  | 'failed';

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
  repairFn?: string | null;
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
  healthScore: number;
  repairs?: {
    runId?: string;
    orphanReservesCancelled?: string[];
    staleDraftsCancelled?: string[];
    rowsRepaired?: number;
    rowsSkipped?: number;
    rowsFailed?: number;
    healthScoreBefore?: number;
    healthScoreAfter?: number;
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
  persistIncidents?: boolean;
  persistDurableIssues?: boolean;
  repairTrigger?: 'cron' | 'ui' | 'script';
}): Promise<AllBrainIntegrityReport> {
  const billingMonth = opts?.billingMonth ?? firstOfMonthIso();
  const issues: HealthIssue[] = [];

  const [resident, electricity, operations, booking, finance] = await Promise.all([
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
    const entityType =
      f.code === 'MISSING_CURRENT_MONTH_RENT' || f.code === 'MISSING_BILLING_PROFILE'
        ? 'booking'
        : f.code === 'MISSING_ELECTRICITY_WINDOW'
          ? 'room'
          : f.code === 'DRAFT_BOOKING_WITH_ACTIVE_STAY'
            ? 'booking'
            : 'customer';
    const entityId =
      entityType === 'booking'
        ? f.code === 'DRAFT_BOOKING_WITH_ACTIVE_STAY'
          ? f.problemBookingId ?? null
          : f.stayBookingId ?? null
        : entityType === 'room'
          ? f.problemBookingId ?? null // room id stashed
          : f.customerId;

    const suggested =
      f.code === 'MISSING_CURRENT_MONTH_RENT'
        ? 'Conservative ensureMonthlyRentInvoice'
        : f.code === 'MISSING_ELECTRICITY_WINDOW'
          ? 'Conservative createElectricityBill from monthly reading'
          : f.code === 'MISSING_BILLING_PROFILE'
            ? 'ensureBillingProfileForBooking'
            : f.code === 'DRAFT_BOOKING_WITH_ACTIVE_STAY'
              ? 'Cancel abandoned draft (no hold/payment/invoice)'
              : f.code === 'ACTIVE_RESIDENCY_WITHOUT_TENANCY'
                ? 'Demote residency_status to vacated (no assigned tenancy)'
                : f.code === 'TENANCY_WITHOUT_ACTIVE_RESIDENCY'
                  ? 'Sync residency_status to active (assigned tenancy exists)'
                  : f.repairable
                    ? 'Cancel orphan reserve blocking active stay'
                    : 'Owner Task — manual investigation';

    issues.push({
      id: issueId('Resident', f.code, entityId),
      severity: f.severity,
      brain: 'Resident',
      entityType,
      entityId,
      code: f.code,
      cause: f.detail,
      suggestedRepair: suggested,
      autoRepairAvailable: f.repairable,
      status: f.repairable ? 'repair_available' : 'needs_owner',
    });
  }

  for (const f of electricity.findings) {
    const auto =
      f.code === 'METER_LOG_WITHOUT_BILL' || f.code === 'GENERATION_JOB_STUCK_WITHOUT_BILL';
    issues.push({
      id: issueId('Electricity', f.code, f.roomId),
      severity: f.severity,
      brain: 'Electricity',
      entityType: 'room',
      entityId: f.roomId,
      code: f.code,
      cause: f.detail,
      suggestedRepair: auto
        ? 'Conservative bill generate / mark stuck job failed'
        : 'Owner Task — do not invent readings',
      autoRepairAvailable: auto,
      status: auto ? 'repair_available' : 'needs_owner',
    });
  }

  for (const f of operations.findings) {
    const synthetic =
      f.code === 'INVALID_BILLING_MONTH' ||
      f.code === 'INVALID_SCREENSHOT' ||
      f.code === 'DUPLICATE_SCREENSHOT' ||
      f.code === 'ORPHAN_PROOF';
    issues.push({
      id: issueId('Operations', f.code, f.entityId),
      severity: f.severity,
      brain: 'Operations',
      entityType: f.entityType,
      entityId: f.entityId,
      code: synthetic ? 'SYNTHETIC_PAYMENT_REVIEW' : f.code,
      cause: f.detail,
      suggestedRepair: synthetic
        ? 'Cancel synthetic verification invoice / clear placeholder proof'
        : 'Excluded from Operations queue automatically',
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
        ? f.code === 'CONFIRMED_WITHOUT_BED'
          ? 'Complete ended fixed-stay booking (stay already finished)'
          : 'Cancel stale/expired reserve with no hold'
        : 'Owner Task — manual booking/bed repair',
      autoRepairAvailable: f.repairable,
      status: f.repairable ? 'repair_available' : 'needs_owner',
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
      suggestedRepair: f.repairable
        ? 'Link orphan rent payment to unique matching paid invoice'
        : 'Owner Task — never delete money; preserve audit history',
      autoRepairAvailable: f.repairable,
      status: f.repairable ? 'repair_available' : 'needs_owner',
    });
  }

  let enriched = enrichIssuesWithRepairMeta(issues);

  const openP0 = enriched.filter((i) => i.severity === 'P0');
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
    enriched.push({
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

  if (opts?.persistDurableIssues || opts?.runSafeRepairs) {
    await upsertDurableIssues(enriched).catch((err) => {
      logger.error('health.durable_issues_upsert_failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  let repairs: AllBrainIntegrityReport['repairs'];
  if (opts?.runSafeRepairs) {
    const dispatch = await dispatchSafeRepairs({
      trigger: opts.repairTrigger ?? 'cron',
      billingMonth,
      issues: enriched,
    });
    repairs = {
      runId: dispatch.runId,
      rowsRepaired: dispatch.rowsRepaired,
      rowsSkipped: dispatch.rowsSkipped,
      rowsFailed: dispatch.rowsFailed,
      healthScoreBefore: dispatch.healthScoreBefore,
      healthScoreAfter: dispatch.healthScoreAfter,
    };

    // Re-audit after repairs for accurate cards/score
    const after = await runAllBrainIntegrityAudits({
      billingMonth,
      runSafeRepairs: false,
      persistDurableIssues: true,
      persistIncidents: false,
    });
    return {
      ...after,
      repairs: {
        ...repairs,
        healthScoreAfter: after.healthScore,
      },
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
    const subset = enriched.filter((i) => i.brain === brain && i.code !== 'OPEN_P0_AGGREGATE');
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

  const healthScore = computeHealthScore(enriched);

  return {
    asOf: new Date().toISOString(),
    billingMonth,
    issues: enriched,
    cards,
    pass: !enriched.some((i) => i.severity === 'P0'),
    healthScore,
    repairs,
  };
}

/** Safe auto-repair registry (docs + Wave 1 compat). Real dispatch in repairHandlers. */
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
    id: 'repairExpiredReservesWithoutHold',
    auto: true,
    description: 'Cancel expired/aged reserves with no hold',
  },
  {
    id: 'cleanupSyntheticPaymentReviews',
    auto: true,
    description: 'Cancel synthetic 2099/OPT*/example.com payment reviews',
  },
  {
    id: 'repairMissingRentInvoiceConservative',
    auto: true,
    description: 'Ensure unpaid rent when anniversary window elapsed',
  },
  {
    id: 'repairMissingElectricityBillConservative',
    auto: true,
    description: 'Create electricity bill from monthly reading when safe',
  },
  {
    id: 'repairAbandonedDraftsWithActiveStay',
    auto: true,
    description: 'Cancel abandoned drafts with active stay',
  },
  {
    id: 'repairResidencyTenancyDrift',
    auto: true,
    description: 'Sync/demote residency_status to assigned tenancy',
  },
  {
    id: 'repairUnambiguousOrphanRentPaymentLinks',
    auto: true,
    description: 'Link orphan rent payment to unique matching paid invoice',
  },
  {
    id: 'repairEndedConfirmedFixedStayBookings',
    auto: true,
    description: 'Complete ended fixed-stay bookings with no active bed',
  },
  {
    id: 'repairMissingBills',
    auto: false,
    description: 'Do not invent rent/electricity bills without conservative gates',
  },
] as const;
