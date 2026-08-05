/**
 * Production validation — aggregates all billing/occupancy audits into PASS/FAIL report.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { runFinancialHealthAudit } from '@/src/services/financialAudit';
import { runBedAudit } from '@/src/services/bedAudit';
import { runVacatingAudit } from '@/src/services/vacatingAudit';
import { countUnreadForAdmin, listAdminInboxNotifications } from '@/src/services/notificationEngine';
import { db } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';
import { and, inArray, sql } from 'drizzle-orm';

export type HealthSection = {
  name: string;
  pass: boolean;
  summary: string;
  mismatches: string[];
};

export type SystemHealthReport = {
  asOf: string;
  billingMonth: string;
  allPass: boolean;
  sections: HealthSection[];
  brainCards?: import('@/src/lib/health/healthBrain').BrainCardSummary[];
  brainIssues?: import('@/src/lib/health/healthBrain').HealthIssue[];
};

async function runInvoiceIntegrityAudit(): Promise<HealthSection> {
  const mismatches: string[] = [];

  const orphanPaid = await db.execute<{ id: string; invoice_number: string }>(sql`
    SELECT fi.id, fi.invoice_number
    FROM financial_invoices fi
    WHERE fi.status IN ('paid', 'partial')
      AND fi.invoice_type NOT IN ('combined')
      AND fi.breakdown IS NOT NULL
      AND coalesce((fi.breakdown->>'paidPaise')::bigint, 0) > fi.amount_paise
    LIMIT 20
  `);

  for (const row of Array.from(orphanPaid)) {
    mismatches.push(`Overpaid invoice ${row.invoice_number} (${row.id})`);
  }

  const cancelledInOutstanding = await db
    .select({ id: financialInvoices.id, invoiceNumber: financialInvoices.invoiceNumber })
    .from(financialInvoices)
    .where(
      and(
        inArray(financialInvoices.status, ['cancelled', 'refunded']),
        sql`EXISTS (
          SELECT 1 FROM financial_invoices fi2
          WHERE fi2.id = ${financialInvoices.id}
            AND coalesce((${financialInvoices.breakdown}->>'paidPaise')::bigint, 0) < ${financialInvoices.amountPaise}
            AND ${financialInvoices.status} = 'cancelled'
        )`,
      ),
    )
    .limit(10);

  void cancelledInOutstanding;

  const partialWithoutPaid = await db.execute<{ invoice_number: string }>(sql`
    SELECT invoice_number FROM financial_invoices
    WHERE status = 'partial'
      AND coalesce((breakdown->>'paidPaise')::bigint, 0) <= 0
    LIMIT 10
  `);

  for (const row of Array.from(partialWithoutPaid)) {
    mismatches.push(`Partial invoice ${row.invoice_number} has zero paidPaise`);
  }

  return {
    name: 'Invoice Integrity',
    pass: mismatches.length === 0,
    summary:
      mismatches.length === 0
        ? 'All invoice payment states consistent.'
        : `${mismatches.length} invoice integrity issue(s).`,
    mismatches,
  };
}

async function runNotificationIntegrityAudit(session: AdminSession): Promise<HealthSection> {
  const mismatches: string[] = [];
  const unread = await listAdminInboxNotifications(session, 'unread', 500);
  const unreadCount = await countUnreadForAdmin(session);

  if (unread.length !== unreadCount) {
    mismatches.push(
      `Unread list length (${unread.length}) != countUnread (${unreadCount})`,
    );
  }

  const staleUnread = unread.filter((n) => n.href === '/admin/overview');
  if (staleUnread.length > 0) {
    mismatches.push(`${staleUnread.length} unread notification(s) with generic overview href`);
  }

  return {
    name: 'Notification Integrity',
    pass: mismatches.length === 0,
    summary:
      mismatches.length === 0
        ? `${unreadCount} unread notifications (SSOT table); inbox consistent.`
        : `${mismatches.length} notification integrity issue(s).`,
    mismatches,
  };
}

export async function runSystemHealthAudit(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<SystemHealthReport> {
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const [financial, bed, vacating, notification, invoice, residentBrain, electricityBrain, brainHub] =
    await Promise.all([
      runFinancialHealthAudit(session, billingMonth),
      runBedAudit(),
      runVacatingAudit(),
      runNotificationIntegrityAudit(session),
      runInvoiceIntegrityAudit(),
      import('@/src/lib/residents/residentBrainIntegrity').then((m) =>
        m.runResidentBrainIntegrityAudit({ currentMonth: billingMonth }),
      ),
      import('@/src/lib/billing/electricityReadingsWithoutBills').then((m) =>
        m.runElectricityReadingsWithoutBillsAudit({ billingMonth }),
      ),
      import('@/src/lib/health/healthBrain').then((m) =>
        m.runAllBrainIntegrityAudits({ billingMonth }),
      ),
    ]);

  const residentMismatches = residentBrain.findings
    .filter((f) => f.severity === 'P0' || f.severity === 'P1')
    .slice(0, 40)
    .map((f) => `[${f.code}] ${f.fullName ?? f.customerId}: ${f.detail}`);

  const electricityMismatches = electricityBrain.findings.slice(0, 40).map((f) => {
    const where = [f.pgName, f.roomNumber ? `Room ${f.roomNumber}` : f.roomId]
      .filter(Boolean)
      .join(' · ');
    return `[${f.code}] ${where}: ${f.detail}`;
  });
  if (!electricityBrain.pass && electricityBrain.alertMessage) {
    electricityMismatches.unshift(electricityBrain.alertMessage);
  }

  const bookingIssues = brainHub.issues.filter((i) => i.brain === 'Booking');
  const opsIssues = brainHub.issues.filter((i) => i.brain === 'Operations');
  const healthMeta = brainHub.issues.filter((i) => i.brain === 'Health');

  const sections: HealthSection[] = [
    {
      name: 'Financial Integrity',
      pass: !financial.hasMismatch,
      summary: financial.hasMismatch
        ? `${financial.checks.filter((c) => c.differencePaise !== 0).length} SSOT mismatch(es).`
        : 'Overview/Revenue/Collections match Resident Financial Engine.',
      mismatches: financial.checks
        .filter((c) => c.differencePaise !== 0)
        .map(
          (c) =>
            `${c.name}: surface ${c.surfaceValuePaise} vs engine ${c.engineValuePaise} (Δ ${c.differencePaise})`,
        ),
    },
    {
      name: 'Invoice Integrity',
      pass: invoice.pass,
      summary: invoice.summary,
      mismatches: invoice.mismatches,
    },
    {
      name: 'Resident Brain Integrity',
      pass: residentBrain.pass,
      summary: residentBrain.pass
        ? `P0 portal/billing OK. Notes: residencyDrift=${residentBrain.counts.ACTIVE_RESIDENCY_WITHOUT_TENANCY}, multiStay=${residentBrain.counts.MULTIPLE_ACTIVE_PRIMARY_STAYS}, missingElec=${residentBrain.counts.MISSING_ELECTRICITY_WINDOW}.`
        : `P0 issues: blocked=${residentBrain.counts.PORTAL_BLOCKED_BY_ORPHAN_RESERVE}, missingRent=${residentBrain.counts.MISSING_CURRENT_MONTH_RENT}.`,
      mismatches: residentMismatches,
    },
    {
      name: 'Booking Brain Integrity',
      pass: !bookingIssues.some((i) => i.severity === 'P0'),
      summary:
        bookingIssues.length === 0
          ? 'No booking structural issues.'
          : `${bookingIssues.length} booking finding(s).`,
      mismatches: bookingIssues.slice(0, 40).map((i) => `[${i.code}] ${i.cause}`),
    },
    {
      name: 'Electricity Brain Integrity',
      pass: electricityBrain.pass,
      summary: electricityBrain.pass
        ? `No readings-without-bills gaps for ${billingMonth}.`
        : `${electricityBrain.alertMessage} (${electricityBrain.findings.length} room(s)).`,
      mismatches: electricityMismatches,
    },
    {
      name: 'Operations Brain Integrity',
      pass: opsIssues.length === 0,
      summary:
        opsIssues.length === 0
          ? 'Pending payment-review sample has no invariant violations.'
          : `${opsIssues.length} invalid pending review(s) (excluded from queue).`,
      mismatches: opsIssues.slice(0, 40).map((i) => `[${i.code}] ${i.cause}`),
    },
    {
      name: 'Health Brain',
      pass: healthMeta.every((i) => i.severity !== 'P0') && brainHub.pass,
      summary: brainHub.pass
        ? 'All brains clear of open P0 issues.'
        : `${healthMeta.length || openP0Count(brainHub.issues)} Health/meta P0 signal(s).`,
      mismatches: brainHub.issues
        .filter((i) => i.severity === 'P0')
        .slice(0, 40)
        .map((i) => `[${i.brain}/${i.code}] ${i.cause}`),
    },
    {
      name: 'Occupancy Integrity',
      pass: bed.issues.length === 0,
      summary:
        bed.issues.length === 0
          ? `${bed.bedsChecked} beds checked — no ghost/double/missing assignments.`
          : `${bed.issues.length} bed issue(s) on ${bed.bedsChecked} beds.`,
      mismatches: bed.issues.map((i) => `${i.kind}: ${i.detail}`),
    },
    {
      name: 'Notification Integrity',
      pass: notification.pass,
      summary: notification.summary,
      mismatches: notification.mismatches,
    },
    {
      name: 'Vacating Integrity',
      pass: vacating.pass,
      summary: vacating.pass
        ? `${vacating.checked} vacating records OK.`
        : `${vacating.issues.length} vacating issue(s).`,
      mismatches: vacating.issues.map((i) => `${i.code}: ${i.detail}`),
    },
    {
      name: 'SSOT Integrity',
      pass: !financial.hasMismatch && invoice.pass && residentBrain.pass && electricityBrain.pass,
      summary:
        !financial.hasMismatch && invoice.pass && residentBrain.pass && electricityBrain.pass
          ? 'Single source of truth aligned across surfaces.'
          : 'SSOT drift detected — review invoices / Resident Brain / Electricity Brain.',
      mismatches: [
        ...financial.checks
          .filter((c) => c.differencePaise !== 0)
          .map((c) => c.name),
        ...invoice.mismatches,
        ...residentMismatches.slice(0, 10),
        ...electricityMismatches.slice(0, 10),
      ],
    },
  ];

  return {
    asOf: new Date().toISOString(),
    billingMonth,
    allPass: sections.every((s) => s.pass),
    sections,
    brainCards: brainHub.cards,
    brainIssues: brainHub.issues,
  };
}

function openP0Count(issues: Array<{ severity: string }>): number {
  return issues.filter((i) => i.severity === 'P0').length;
}
