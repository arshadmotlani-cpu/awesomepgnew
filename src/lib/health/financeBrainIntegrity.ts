/**
 * Finance Brain integrity — thin targeted checks (Wave 1).
 * Avoids full per-customer financialIntegrityAudit scan on the hot health path.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type FinanceBrainFindingCode =
  | 'PAYMENT_WITHOUT_INVOICE'
  | 'DUPLICATE_INVOICE_PAYMENT_ID'
  | 'PARTIAL_ZERO_PAID';

export type FinanceBrainFinding = {
  code: FinanceBrainFindingCode;
  severity: 'P0' | 'P1' | 'P2';
  entityType: string;
  entityId: string;
  detail: string;
  repairable: boolean;
};

export type FinanceBrainIntegrityReport = {
  asOf: string;
  findings: FinanceBrainFinding[];
  pass: boolean;
};

type Row = Record<string, unknown>;

function asRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return [];
}

export async function runFinanceBrainIntegrityAudit(): Promise<FinanceBrainIntegrityReport> {
  const findings: FinanceBrainFinding[] = [];

  const orphanPayments = asRows(
    await db.execute(sql`
      SELECT
        p.id::text AS payment_id,
        p.provider::text,
        p.provider_payment_id,
        p.purpose::text
      FROM payments p
      WHERE p.status = 'succeeded'
        AND p.purpose IN ('rent', 'electricity', 'extension')
        AND coalesce(p.amount_paise, 0) > 0
        AND p.created_at > NOW() - INTERVAL '90 days'
        AND NOT EXISTS (SELECT 1 FROM rent_invoices ri WHERE ri.payment_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM electricity_invoices ei WHERE ei.payment_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM financial_invoices fi WHERE fi.payment_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM stay_extensions se WHERE se.payment_id = p.id)
      ORDER BY p.created_at DESC
      LIMIT 50
    `),
  );

  for (const row of orphanPayments) {
    findings.push({
      code: 'PAYMENT_WITHOUT_INVOICE',
      severity: 'P1',
      entityType: 'payment',
      entityId: String(row.payment_id),
      detail: `Succeeded ${row.purpose} payment ${row.provider}/${row.provider_payment_id} has no invoice payment_id link`,
      repairable: false,
    });
  }

  const dupPaymentIds = asRows(
    await db.execute(sql`
      SELECT payment_id::text AS payment_id, source, n
      FROM (
        SELECT payment_id, 'rent_invoices'::text AS source, COUNT(*)::int AS n
        FROM rent_invoices
        WHERE payment_id IS NOT NULL
        GROUP BY payment_id
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT payment_id, 'electricity_invoices'::text, COUNT(*)::int
        FROM electricity_invoices
        WHERE payment_id IS NOT NULL
        GROUP BY payment_id
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT payment_id, 'financial_invoices'::text, COUNT(*)::int
        FROM financial_invoices
        WHERE payment_id IS NOT NULL
        GROUP BY payment_id
        HAVING COUNT(*) > 1
      ) dups
      LIMIT 50
    `),
  );

  for (const row of dupPaymentIds) {
    findings.push({
      code: 'DUPLICATE_INVOICE_PAYMENT_ID',
      severity: 'P0',
      entityType: 'payment',
      entityId: String(row.payment_id),
      detail: `Payment ${row.payment_id} is linked from ${row.n} rows in ${row.source}`,
      repairable: false,
    });
  }

  const partialZero = asRows(
    await db.execute(sql`
      SELECT id::text AS invoice_id, invoice_number
      FROM financial_invoices
      WHERE status = 'partial'
        AND coalesce((breakdown->>'paidPaise')::bigint, 0) <= 0
      LIMIT 30
    `),
  );

  for (const row of partialZero) {
    findings.push({
      code: 'PARTIAL_ZERO_PAID',
      severity: 'P1',
      entityType: 'financial_invoice',
      entityId: String(row.invoice_id),
      detail: `Partial invoice ${row.invoice_number} has zero paidPaise`,
      repairable: false,
    });
  }

  const pass = !findings.some((f) => f.severity === 'P0');
  return { asOf: new Date().toISOString(), findings, pass };
}
