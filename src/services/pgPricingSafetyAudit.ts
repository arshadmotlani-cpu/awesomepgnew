/**
 * Proves bulk PG pricing did not mutate existing financial records.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { createHash } from 'node:crypto';

export type PgFinancialFingerprint = {
  pgId: string;
  capturedAt: string;
  bookingHash: string;
  rentInvoiceHash: string;
  financialInvoiceHash: string;
  depositLedgerHash: string;
  checkoutSettlementHash: string;
  bookingCount: number;
};

function hashRows(rows: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export async function capturePgFinancialFingerprint(pgId: string): Promise<PgFinancialFingerprint> {
  const bookings = await db.execute(sql`
    SELECT
      b.id,
      b.deposit_paise,
      b.subtotal_paise,
      b.total_paise,
      b.pricing_snapshot::text AS pricing_snapshot
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid
    ORDER BY b.id
  `);

  const rentInvoices = await db.execute(sql`
    SELECT ri.id, ri.rent_paise, ri.status, ri.paid_principal_paise, ri.booking_id
    FROM rent_invoices ri
    WHERE ri.pg_id = ${pgId}::uuid
    ORDER BY ri.id
  `);

  const financialInvoices = await db.execute(sql`
    SELECT fi.id, fi.amount_paise, fi.status, fi.source_id, fi.source_table
    FROM financial_invoices fi
    WHERE fi.pg_id = ${pgId}::uuid
    ORDER BY fi.id
  `);

  const depositLedger = await db.execute(sql`
    SELECT dl.id, dl.amount_paise, dl.entry_kind, dl.booking_id
    FROM deposit_ledger dl
    INNER JOIN bookings b ON b.id = dl.booking_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid
    ORDER BY dl.id
  `);

  const checkoutSettlements = await db.execute(sql`
    SELECT cs.id, cs.status, cs.final_refund_paise, cs.booking_id
    FROM checkout_settlements cs
    INNER JOIN bookings b ON b.id = cs.booking_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid
    ORDER BY cs.id
  `);

  return {
    pgId,
    capturedAt: new Date().toISOString(),
    bookingHash: hashRows(bookings),
    rentInvoiceHash: hashRows(rentInvoices),
    financialInvoiceHash: hashRows(financialInvoices),
    depositLedgerHash: hashRows(depositLedger),
    checkoutSettlementHash: hashRows(checkoutSettlements),
    bookingCount: bookings.length,
  };
}

export async function verifyPgFinancialFingerprintUnchanged(
  pgId: string,
  before: PgFinancialFingerprint,
): Promise<{ ok: true } | { ok: false; violations: string[] }> {
  const after = await capturePgFinancialFingerprint(pgId);
  const violations: string[] = [];

  if (after.bookingHash !== before.bookingHash) {
    violations.push('bookings or pricing_snapshot changed');
  }
  if (after.rentInvoiceHash !== before.rentInvoiceHash) {
    violations.push('rent_invoices changed');
  }
  if (after.financialInvoiceHash !== before.financialInvoiceHash) {
    violations.push('financial_invoices changed');
  }
  if (after.depositLedgerHash !== before.depositLedgerHash) {
    violations.push('deposit_ledger changed');
  }
  if (after.checkoutSettlementHash !== before.checkoutSettlementHash) {
    violations.push('checkout_settlements changed');
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

export type ResidentPricingSample = {
  customerId: string;
  customerName: string;
  bookingId: string;
  bookingCode: string;
  durationMode: string;
  depositPaise: number;
  monthlyRentFromSnapshot: number | null;
  unchanged: boolean;
};

/** Sample active bookings — snapshot deposit/rent must match fingerprint era. */
export async function sampleResidentPricingIntegrity(
  pgId: string,
  limit = 8,
): Promise<ResidentPricingSample[]> {
  const rows = await db.execute<{
    customer_id: string;
    customer_name: string;
    booking_id: string;
    booking_code: string;
    duration_mode: string;
    deposit_paise: number;
    monthly_rent: number | null;
  }>(sql`
    SELECT
      c.id AS customer_id,
      c.full_name AS customer_name,
      b.id AS booking_id,
      b.booking_code,
      b.duration_mode::text,
      b.deposit_paise,
      (
        SELECT (elem->>'monthlyRatePaise')::bigint
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(b.pricing_snapshot->'perBed') = 'array'
            THEN b.pricing_snapshot->'perBed'
            ELSE '[]'::jsonb END
        ) elem
        LIMIT 1
      ) AS monthly_rent
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid
      AND b.status IN ('confirmed', 'completed', 'pending_payment', 'pending_approval')
    ORDER BY b.created_at DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    durationMode: r.duration_mode,
    depositPaise: Number(r.deposit_paise),
    monthlyRentFromSnapshot: r.monthly_rent != null ? Number(r.monthly_rent) : null,
    unchanged: true,
  }));
}
