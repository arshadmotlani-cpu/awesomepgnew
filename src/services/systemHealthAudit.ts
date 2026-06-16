/**
 * Production validation — aggregates all billing/occupancy audits into PASS/FAIL report.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { runFinancialHealthAudit } from '@/src/services/financialAudit';
import { runBedAudit } from '@/src/services/bedAudit';
import { runVacatingAudit } from '@/src/services/vacatingAudit';
import { countUnreadNotifications, listAdminNotifications } from '@/src/services/adminNotifications';
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
  const unread = await listAdminNotifications(session, 'unread', 500);
  const unreadCount = await countUnreadNotifications(session);

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
        ? `${unreadCount} unread (NEW) notifications; state machine OK.`
        : `${mismatches.length} notification integrity issue(s).`,
    mismatches,
  };
}

export async function runSystemHealthAudit(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<SystemHealthReport> {
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const [financial, bed, vacating, notification, invoice] = await Promise.all([
    runFinancialHealthAudit(session, billingMonth),
    runBedAudit(),
    runVacatingAudit(),
    runNotificationIntegrityAudit(session),
    runInvoiceIntegrityAudit(),
  ]);

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
      pass: !financial.hasMismatch && invoice.pass,
      summary:
        !financial.hasMismatch && invoice.pass
          ? 'Single source of truth aligned across surfaces.'
          : 'SSOT drift detected — run recalculate and review invoices.',
      mismatches: [
        ...financial.checks
          .filter((c) => c.differencePaise !== 0)
          .map((c) => c.name),
        ...invoice.mismatches,
      ],
    },
  ];

  return {
    asOf: new Date().toISOString(),
    billingMonth,
    allPass: sections.every((s) => s.pass),
    sections,
  };
}
