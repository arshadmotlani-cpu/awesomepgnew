/**
 * Synthetic payment-review pollution cleanup — auditable, never hard-deletes money.
 *
 * Match ONLY verification junk:
 * - billing_month year ≥ 2090 AND/OR
 * - invoice markers OPTVERIFY|OPTBROWSER|REPROFAIL|P0OUTBOX AND/OR
 * - payment_proof_url host example.com
 */

import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityInvoices, rentInvoices } from '@/src/db/schema';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { PAYMENT_REVIEW_SENTINEL_YEAR_MIN } from '@/src/lib/payments/paymentReviewInvariants';

export const SYNTHETIC_MARKER_RE =
  /OPTVERIFY|OPTBROWSER|REPROFAIL|P0OUTBOX/i;

export function isExampleComProofUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host === 'example.com' || host.endsWith('.example.com');
  } catch {
    return /example\.com/i.test(trimmed);
  }
}

export function isSentinelBillingMonth(billingMonth: string | Date | null | undefined): boolean {
  if (billingMonth == null) return false;
  const raw =
    typeof billingMonth === 'string'
      ? billingMonth
      : billingMonth instanceof Date
        ? billingMonth.toISOString().slice(0, 10)
        : String(billingMonth);
  const year = Number(/^(\d{4})/.exec(raw)?.[1]);
  return Number.isFinite(year) && year >= PAYMENT_REVIEW_SENTINEL_YEAR_MIN;
}

export function matchesSyntheticRentRow(row: {
  billingMonth: string | Date | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  paymentProofUrl?: string | null;
  isAdhoc?: boolean | null;
}): boolean {
  const marker =
    SYNTHETIC_MARKER_RE.test(row.invoiceNumber ?? '') ||
    SYNTHETIC_MARKER_RE.test(row.notes ?? '');
  const sentinel = isSentinelBillingMonth(row.billingMonth);
  const example = isExampleComProofUrl(row.paymentProofUrl);
  // Require at least one strong signal; prefer combo of sentinel/example with marker or adhoc+sentinel
  if (marker && (sentinel || example || row.isAdhoc)) return true;
  if (sentinel && example) return true;
  if (sentinel && row.isAdhoc) return true;
  if (example && row.isAdhoc) return true;
  return false;
}

export type SyntheticCleanupResult = {
  rentCancelled: string[];
  electricityCleared: string[];
  skipped: Array<{ id: string; reason: string }>;
};

export async function previewSyntheticPaymentReviewPollution(limit = 200): Promise<{
  rent: Array<{ id: string; invoiceNumber: string | null; billingMonth: string; proof: string | null }>;
  electricity: Array<{ id: string; invoiceNumber: string | null; billingMonth: string; proof: string | null }>;
}> {
  const rentRows = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      billingMonth: rentInvoices.billingMonth,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      isAdhoc: rentInvoices.isAdhoc,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(
      and(
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
        or(
          sql`extract(year from ${rentInvoices.billingMonth}::date) >= ${PAYMENT_REVIEW_SENTINEL_YEAR_MIN}`,
          sql`${rentInvoices.invoiceNumber} ~* 'OPTVERIFY|OPTBROWSER|REPROFAIL|P0OUTBOX'`,
          sql`coalesce(${rentInvoices.paymentProofUrl}, '') ilike '%example.com%'`,
        ),
      ),
    )
    .limit(limit);

  const rent = rentRows
    .filter((r) =>
      matchesSyntheticRentRow({
        billingMonth: r.billingMonth,
        invoiceNumber: r.invoiceNumber,
        paymentProofUrl: r.paymentProofUrl,
        isAdhoc: r.isAdhoc,
      }),
    )
    .map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      billingMonth: String(r.billingMonth).slice(0, 10),
      proof: r.paymentProofUrl,
    }));

  const elecRows = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      billingMonth: electricityInvoices.billingMonth,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      status: electricityInvoices.status,
      isPipelineTest: electricityInvoices.isPipelineTest,
    })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.status, 'pending'),
        isNotNull(electricityInvoices.paymentProofUrl),
        or(
          sql`extract(year from ${electricityInvoices.billingMonth}::date) >= ${PAYMENT_REVIEW_SENTINEL_YEAR_MIN}`,
          sql`coalesce(${electricityInvoices.paymentProofUrl}, '') ilike '%example.com%'`,
          eq(electricityInvoices.isPipelineTest, true),
        ),
      ),
    )
    .limit(limit);

  const electricity = elecRows
    .filter(
      (r) =>
        isExampleComProofUrl(r.paymentProofUrl) ||
        isSentinelBillingMonth(r.billingMonth) ||
        (r.isPipelineTest && isExampleComProofUrl(r.paymentProofUrl)),
    )
    .filter((r) => isExampleComProofUrl(r.paymentProofUrl) || isSentinelBillingMonth(r.billingMonth))
    .map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      billingMonth: String(r.billingMonth).slice(0, 10),
      proof: r.paymentProofUrl,
    }));

  return { rent, electricity };
}

export async function cleanupSyntheticPaymentReviews(opts?: {
  limit?: number;
  dryRun?: boolean;
}): Promise<SyntheticCleanupResult> {
  const limit = opts?.limit ?? 100;
  const dryRun = Boolean(opts?.dryRun);
  const preview = await previewSyntheticPaymentReviewPollution(limit);
  const result: SyntheticCleanupResult = {
    rentCancelled: [],
    electricityCleared: [],
    skipped: [],
  };

  for (const row of preview.rent) {
    if (dryRun) {
      result.rentCancelled.push(row.id);
      continue;
    }
    const updated = await db
      .update(rentInvoices)
      .set({
        status: 'cancelled',
        paymentProofUrl: null,
        cancellationReason:
          'Health Brain Wave 2: synthetic verification invoice cancelled (sentinel month / OPT* / example.com proof)',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rentInvoices.id, row.id),
          inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
        ),
      )
      .returning({ id: rentInvoices.id });

    if (updated[0]) {
      result.rentCancelled.push(updated[0].id);
      await writeAuditLogNonBlocking(db, {
        actorType: 'system',
        actorId: null,
        action: 'health.synthetic_cancelled',
        entity: 'rent_invoice',
        entityId: updated[0].id,
        diff: {
          invoiceNumber: row.invoiceNumber,
          billingMonth: row.billingMonth,
          proofPrefix: row.proof?.slice(0, 80) ?? null,
        },
      }).catch(() => undefined);
    } else {
      result.skipped.push({ id: row.id, reason: 'status_changed' });
    }
  }

  for (const row of preview.electricity) {
    if (dryRun) {
      result.electricityCleared.push(row.id);
      continue;
    }
    // Clear proof only for pending; cancel if sentinel/pipeline junk with example.com
    const updated = await db
      .update(electricityInvoices)
      .set({
        paymentProofUrl: null,
        status: isSentinelBillingMonth(row.billingMonth) ? 'cancelled' : 'pending',
        updatedAt: new Date(),
      })
      .where(and(eq(electricityInvoices.id, row.id), eq(electricityInvoices.status, 'pending')))
      .returning({ id: electricityInvoices.id });

    if (updated[0]) {
      result.electricityCleared.push(updated[0].id);
      await writeAuditLogNonBlocking(db, {
        actorType: 'system',
        actorId: null,
        action: 'health.synthetic_cancelled',
        entity: 'electricity_invoice',
        entityId: updated[0].id,
        diff: {
          invoiceNumber: row.invoiceNumber,
          billingMonth: row.billingMonth,
          proofPrefix: row.proof?.slice(0, 80) ?? null,
        },
      }).catch(() => undefined);
    } else {
      result.skipped.push({ id: row.id, reason: 'status_changed' });
    }
  }

  return result;
}
