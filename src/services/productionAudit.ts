/**
 * Unified production audit — aggregates all deploy gates into one report.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { runSystemHealthAudit, type HealthSection } from '@/src/services/systemHealthAudit';
import { runDepositAudit } from '@/src/services/depositAudit';
import { runCheckoutAudit } from '@/src/services/checkoutAudit';
import { runCounterParityAudit } from '@/src/services/counterParityAudit';
import { getPaymentReviewIntegrityReport } from '@/src/services/paymentReviewIntegrity';
import { countUnreadForAdmin, listAdminInboxNotifications } from '@/src/services/notificationEngine';
import {
  evaluateRoomOsOutboxHealth,
  getRoomOsOutboxMetrics,
} from '@/src/roomOs/outbox/metrics';
import { runMaterializationFreshnessAudit } from '@/src/roomOs/acceptance/materializationFreshnessAudit';
import { runOperationsCentreParityAudit } from '@/src/roomOs/acceptance/operationsParityAudit';
import { db } from '@/src/db/client';
import { unresolvedActions } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';

export type ProductionAuditGate = {
  id: string;
  name: string;
  pass: boolean;
  summary: string;
  mismatches: string[];
};

export type ProductionAuditReport = {
  asOf: string;
  billingMonth: string;
  allPass: boolean;
  gates: ProductionAuditGate[];
};

async function runOpsBadgeAudit(session: AdminSession): Promise<ProductionAuditGate> {
  const { loadAdminNavBadges } = await import('@/src/services/adminNavBadges');
  const { loadUnifiedOperationsQueue } = await import('@/src/services/unifiedOperationsQueue');

  const badges = await loadAdminNavBadges(session);
  const ops = await loadUnifiedOperationsQueue(session, null);
  const mismatches: string[] = [];

  if ((badges.operations ?? 0) !== ops.totalCount) {
    mismatches.push(
      `Operations badge ${badges.operations ?? 0} != unified queue ${ops.totalCount}`,
    );
  }
  if ((badges.overview ?? 0) !== ops.totalCount) {
    mismatches.push(
      `Overview badge ${badges.overview ?? 0} != unified queue ${ops.totalCount}`,
    );
  }

  const staleInvoiceReview = await db
    .select({ id: unresolvedActions.id })
    .from(unresolvedActions)
    .where(
      and(
        eq(unresolvedActions.status, 'OPEN'),
        eq(unresolvedActions.actionType, 'invoice_review'),
      ),
    )
    .limit(20);

  if (staleInvoiceReview.length > 0) {
    mismatches.push(
      `${staleInvoiceReview.length} stale invoice_review unresolved action(s)`,
    );
  }

  return {
    id: 'ops_badge',
    name: 'Operations Badge Parity',
    pass: mismatches.length === 0,
    summary:
      mismatches.length === 0
        ? `Operations badge ${badges.operations ?? 0} matches unified queue.`
        : `${mismatches.length} ops badge issue(s).`,
    mismatches,
  };
}

async function runNotificationParityAudit(session: AdminSession): Promise<ProductionAuditGate> {
  const mismatches: string[] = [];
  const unread = await listAdminInboxNotifications(session, 'unread', 500);
  const count = await countUnreadForAdmin(session);

  if (unread.length !== count) {
    mismatches.push(`Inbox list ${unread.length} != unread count ${count}`);
  }

  const paymentReport = await getPaymentReviewIntegrityReport(session);
  const staleTotal =
    paymentReport.stale.openPaymentReceivedActionItems.length +
    paymentReport.stale.orphanPaymentProofUnresolved.length +
    paymentReport.stale.stalePaymentNotifications.length;

  if (staleTotal > 0) {
    mismatches.push(`${staleTotal} stale payment review artifact(s)`);
  }

  return {
    id: 'notification_parity',
    name: 'Notification Parity',
    pass: mismatches.length === 0,
    summary:
      mismatches.length === 0
        ? `${count} unread notifications; payment artifacts clean.`
        : `${mismatches.length} notification parity issue(s).`,
    mismatches,
  };
}

async function runRoomOsOutboxAudit(): Promise<ProductionAuditGate> {
  const metrics = await getRoomOsOutboxMetrics();
  const health = evaluateRoomOsOutboxHealth(metrics);
  return {
    id: 'room_os_outbox',
    name: 'Room OS Outbox Health',
    pass: health.pass,
    summary: health.pass
      ? `Outbox healthy — pending ${metrics.pending}, dead-letter ${metrics.deadLetter}.`
      : `${health.mismatches.length} outbox health issue(s).`,
    mismatches: health.mismatches,
  };
}

async function runRoomOsMaterializationAudit(): Promise<ProductionAuditGate> {
  const report = await runMaterializationFreshnessAudit();
  const mismatches: string[] = [];
  if (!report.outboxPass) mismatches.push('Outbox health check failed');
  for (const row of report.rows) {
    if (row.severity === 'fail') mismatches.push(`${row.pgName}: ${row.message}`);
    if (row.severity === 'warning') {
      mismatches.push(`[warn] ${row.pgName}: ${row.message}`);
    }
  }
  if (report.propertyIndexFailCount > 0) {
    mismatches.push(`Property index parity fail findings: ${report.propertyIndexFailCount}`);
  }
  if (report.workQueueFailCount > 0) {
    mismatches.push(`Work queue parity fail findings: ${report.workQueueFailCount}`);
  }

  const hasFail = report.rows.some((r) => r.severity === 'fail') || report.propertyIndexFailCount > 0 || report.workQueueFailCount > 0;

  return {
    id: 'room_os_materialization',
    name: 'Room OS Materialization Freshness',
    pass: report.outboxPass && !hasFail,
    summary: report.summary,
    mismatches,
  };
}

async function runRoomOsOperationsParityAudit(session: AdminSession): Promise<ProductionAuditGate> {
  const report = await runOperationsCentreParityAudit(session);
  const mismatches: string[] = [];
  if (!report.sharedTabPass) {
    for (const row of report.rows.filter((r) => !r.informational && !r.matches)) {
      mismatches.push(
        `${row.filter}: legacy ${row.legacyCount} vs room-os ${row.roomOsCount}`,
      );
    }
  }
  for (const row of report.migratedTabInformational) {
    if (row.legacyCount !== row.roomOsCount || row.bookingIdDelta.length > 0) {
      mismatches.push(
        `[info] ${row.filter}: legacy ${row.legacyCount} vs room-os ${row.roomOsCount}; delta bookings ${row.bookingIdDelta.join(', ') || 'none'}`,
      );
    }
  }
  if (report.propertyIndexFailCount > 0) {
    mismatches.push(`Property index certification fails: ${report.propertyIndexFailCount}`);
  }
  if (report.workQueueFailCount > 0) {
    mismatches.push(`Work queue certification fails: ${report.workQueueFailCount}`);
  }

  return {
    id: 'room_os_ops_parity',
    name: 'Operations Centre Legacy vs Room OS Parity',
    pass: report.pass,
    summary: report.summary,
    mismatches,
  };
}

function healthSectionToGate(section: HealthSection, id: string): ProductionAuditGate {
  return {
    id,
    name: section.name,
    pass: section.pass,
    summary: section.summary,
    mismatches: section.mismatches,
  };
}

export async function runProductionAudit(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<ProductionAuditReport> {
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const [systemHealth, deposit, checkout, counterParity, opsBadge, notificationParity, roomOsOutbox, roomOsMaterialization, roomOsOpsParity] =
    await Promise.all([
      runSystemHealthAudit(session, billingMonth),
      runDepositAudit(session, { sampleSize: 10 }),
      runCheckoutAudit(session),
      runCounterParityAudit(session, billingMonth),
      runOpsBadgeAudit(session),
      runNotificationParityAudit(session),
      runRoomOsOutboxAudit(),
      runRoomOsMaterializationAudit(),
      runRoomOsOperationsParityAudit(session),
    ]);

  const gates: ProductionAuditGate[] = [
    ...systemHealth.sections.map((s, i) =>
      healthSectionToGate(s, `system_${i}_${s.name.toLowerCase().replace(/\s+/g, '_')}`),
    ),
    {
      id: 'deposit_sample',
      name: 'Deposit Integrity (sample)',
      pass: deposit.pass,
      summary: deposit.summary,
      mismatches: deposit.issues.map(
        (i) => `${i.bookingCode}: ${i.code} — ${i.detail}`,
      ),
    },
    {
      id: 'checkout_pipeline',
      name: 'Checkout Pipeline',
      pass: checkout.pass,
      summary: checkout.summary,
      mismatches: checkout.issues.map((i) => `${i.code}: ${i.detail}`),
    },
    {
      id: 'counter_parity',
      name: 'Counter Parity',
      pass: counterParity.pass,
      summary: counterParity.summary,
      mismatches: counterParity.rows
        .filter((r) => !r.matches)
        .map(
          (r) =>
            `${r.metric}: overview ${r.overviewValue} vs ${r.destination} ${r.destinationValue}`,
        ),
    },
    opsBadge,
    notificationParity,
    roomOsOutbox,
    roomOsMaterialization,
    roomOsOpsParity,
  ];

  return {
    asOf: new Date().toISOString(),
    billingMonth,
    allPass: gates.every((g) => g.pass),
    gates,
  };
}
