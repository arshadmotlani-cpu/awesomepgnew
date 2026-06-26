/**
 * Production checkout investigation — Dhruv, Arshad, active queue.
 * Read-only unless repair functions are invoked explicitly.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  executeCheckoutSettlementRepair,
} from '@/src/services/checkoutSettlementRepair';
import { archiveCheckoutSettlement } from '@/src/services/checkoutSettlement';
import { cleanupContinuousStayFalseCheckouts, getResidencyAdminView } from '@/src/services/continuousResidency';
import { eq } from 'drizzle-orm';
import { checkoutSettlements } from '@/src/db/schema';

function inr(paise: unknown) {
  return paiseToInr(Number(paise ?? 0));
}

export type ResidentCheckoutReport = {
  customer: Record<string, unknown>;
  bookings: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  vacating: Record<string, unknown>[];
  settlements: Record<string, unknown>[];
  depositLedger: Record<string, unknown>[];
  diagnosis: string[];
};

async function residentReport(whereSql: ReturnType<typeof sql>): Promise<ResidentCheckoutReport> {
  const customers = await db.execute(sql`
    SELECT id, full_name, phone, residency_status, email
    FROM customers c
    WHERE ${whereSql}
    LIMIT 5
  `);

  if (customers.length === 0) {
    return {
      customer: {},
      bookings: [],
      payments: [],
      vacating: [],
      settlements: [],
      depositLedger: [],
      diagnosis: ['No matching customer found'],
    };
  }

  const customerId = customers[0].id as string;

  const bookings = await db.execute(sql`
    SELECT
      b.id, b.booking_code, b.status, b.stay_type, b.duration_mode,
      b.expected_checkout_date, b.subtotal_paise, b.deposit_paise, b.total_paise,
      b.discount_paise, b.created_at,
      lower(br.stay_range)::text AS check_in,
      upper(br.stay_range)::text AS check_out,
      br.status AS reservation_status,
      p.name AS pg_name, r.room_number, bd.bed_code
    FROM bookings b
    LEFT JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    LEFT JOIN beds bd ON bd.id = br.bed_id
    LEFT JOIN rooms r ON r.id = bd.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = ${customerId}::uuid
    ORDER BY b.created_at ASC
  `);

  const payments = await db.execute(sql`
    SELECT p.purpose, p.amount_paise, p.status, p.created_at, b.booking_code
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    WHERE b.customer_id = ${customerId}::uuid
    ORDER BY p.created_at
  `);

  const vacating = await db.execute(sql`
    SELECT vr.*, b.booking_code, b.stay_type, b.duration_mode
    FROM vacating_requests vr
    JOIN bookings b ON b.id = vr.booking_id
    WHERE vr.customer_id = ${customerId}::uuid
    ORDER BY vr.created_at
  `);

  const settlements = await db.execute(sql`
    SELECT cs.*, b.booking_code, b.stay_type, b.duration_mode, vr.status AS vacating_status
    FROM checkout_settlements cs
    JOIN bookings b ON b.id = cs.booking_id
    JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE cs.customer_id = ${customerId}::uuid
    ORDER BY cs.created_at
  `);

  const depositLedger = await db.execute(sql`
    SELECT dl.entry_kind, dl.amount_paise, dl.reason, dl.created_at, b.booking_code
    FROM deposit_ledger dl
    JOIN bookings b ON b.id = dl.booking_id
    WHERE b.customer_id = ${customerId}::uuid
    ORDER BY dl.created_at
  `);

  const diagnosis: string[] = [];
  for (const s of settlements) {
    const applies = noticeDeductionAppliesToBooking({
      stayType: s.stay_type as string,
      durationMode: s.duration_mode as string,
    });
    if (!applies && Number(s.notice_deduction_paise) > 0) {
      diagnosis.push(
        `BUG: notice deduction ${inr(s.notice_deduction_paise)} on ${s.stay_type}/${s.duration_mode} booking ${s.booking_code}`,
      );
    }
  }

  return {
    customer: customers[0] as Record<string, unknown>,
    bookings: bookings.map((b) => ({
      ...b,
      subtotal_inr: inr(b.subtotal_paise),
      deposit_inr: inr(b.deposit_paise),
      total_inr: inr(b.total_paise),
    })) as Record<string, unknown>[],
    payments: payments.map((p) => ({
      ...p,
      amount_inr: inr(p.amount_paise),
    })) as Record<string, unknown>[],
    vacating: vacating.map((v) => ({
      ...v,
      deduction_inr: inr(v.deduction_paise),
    })) as Record<string, unknown>[],
    settlements: settlements.map((s) => ({
      ...s,
      notice_deduction_inr: inr(s.notice_deduction_paise),
      electricity_share_inr: inr(s.electricity_share_paise),
      final_refund_inr: inr(s.final_refund_paise),
    })) as Record<string, unknown>[],
    depositLedger: depositLedger.map((l) => ({
      ...l,
      amount_inr: inr(l.amount_paise),
    })) as Record<string, unknown>[],
    diagnosis,
  };
}

export async function runCheckoutProductionInvestigation() {
  const dhruv = await residentReport(sql`
    c.full_name ILIKE '%dhruv%'
    AND EXISTS (
      SELECT 1 FROM bookings b2
      JOIN bed_reservations br ON br.booking_id = b2.id AND br.kind = 'primary'
      JOIN beds bd ON bd.id = br.bed_id
      JOIN rooms r ON r.id = bd.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE b2.customer_id = c.id
        AND r.room_number = '102'
        AND bd.bed_code ILIKE 'B3'
        AND p.name ILIKE '%shanti%'
    )
  `);

  const arshad = await residentReport(sql`
    c.full_name ILIKE '%arshad%motlani%'
  `);

  const activeQueue = await db.execute(sql`
    SELECT
      cs.id AS settlement_id,
      cs.status AS settlement_status,
      c.full_name,
      b.booking_code,
      b.stay_type,
      b.duration_mode,
      b.status AS booking_status,
      cs.notice_deduction_paise,
      cs.final_refund_paise,
      cs.electricity_meter_photo_url,
      cs.payout_upi_id,
      cs.payout_qr_url,
      vr.status AS vacating_status,
      vr.vacating_date,
      p.name AS pg_name,
      r.room_number,
      bd.bed_code,
      EXISTS (
        SELECT 1 FROM bed_reservations br2
        WHERE br2.booking_id = b.id
          AND br2.kind = 'primary'
          AND br2.status = 'active'
          AND CURRENT_DATE <@ br2.stay_range
      ) AS active_stay_today
    FROM checkout_settlements cs
    JOIN customers c ON c.id = cs.customer_id
    JOIN bookings b ON b.id = cs.booking_id
    JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    LEFT JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    LEFT JOIN beds bd ON bd.id = br.bed_id
    LEFT JOIN rooms r ON r.id = bd.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE cs.status NOT IN ('completed', 'refund_paid', 'archived')
    ORDER BY cs.updated_at DESC
  `);

  const staleCandidates = await db.execute(sql`
    SELECT cs.id::text AS settlement_id, c.full_name, b.booking_code, cs.status, vr.status AS vacating_status, b.status AS booking_status
    FROM checkout_settlements cs
    JOIN customers c ON c.id = cs.customer_id
    JOIN bookings b ON b.id = cs.booking_id
    JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE cs.status NOT IN ('completed', 'refund_paid', 'archived')
      AND (
        vr.status IN ('completed', 'rejected')
        OR b.status IN ('cancelled', 'completed')
        OR NOT EXISTS (
          SELECT 1 FROM bed_reservations br
          WHERE br.booking_id = b.id
            AND br.kind = 'primary'
            AND br.status = 'active'
            AND CURRENT_DATE <@ br.stay_range
        )
      )
  `);

  return {
    generatedAt: new Date().toISOString(),
    dhruv: { ...dhruv, residency: await getResidencyAdminView(dhruv.customer?.id as string) },
    arshad: { ...arshad, residency: await getResidencyAdminView(arshad.customer?.id as string) },
    activeQueue: activeQueue.map((q) => ({
      ...q,
      notice_deduction_inr: inr(q.notice_deduction_paise),
      final_refund_inr: inr(q.final_refund_paise),
    })),
    staleCandidates,
  };
}

export async function repairFixedStayNoticeDeductions(adminId: string): Promise<{
  updated: number;
  rows: Array<{ settlementId: string; bookingCode: string; before: number }>;
}> {
  const rows = await db.execute<{
    id: string;
    booking_code: string;
    notice_deduction_paise: number;
    stay_type: string;
    duration_mode: string;
  }>(sql`
    SELECT cs.id::text AS id, b.booking_code, cs.notice_deduction_paise, b.stay_type, b.duration_mode
    FROM checkout_settlements cs
    JOIN bookings b ON b.id = cs.booking_id
    WHERE cs.notice_deduction_paise > 0
      AND cs.amounts_locked = false
      AND cs.status IN ('awaiting_resident_details', 'awaiting_admin_review')
      AND (
        b.duration_mode IN ('fixed_stay', 'daily', 'weekly')
        OR b.stay_type = 'fixed_date_stay'
      )
  `);

  const fixed: Array<{ settlementId: string; bookingCode: string; before: number }> = [];
  let updated = 0;

  for (const row of rows) {
    if (
      !noticeDeductionAppliesToBooking({
        stayType: row.stay_type,
        durationMode: row.duration_mode,
      })
    ) {
      await db
        .update(checkoutSettlements)
        .set({ noticeDeductionPaise: 0, noticeShortfallDays: 0, updatedAt: new Date() })
        .where(eq(checkoutSettlements.id, row.id));
      fixed.push({
        settlementId: row.id,
        bookingCode: row.booking_code,
        before: Number(row.notice_deduction_paise),
      });
      updated += 1;
    }
  }

  await db.execute(sql`
    UPDATE vacating_requests vr
    SET deduction_paise = 0, notice_compliant = true, updated_at = now()
    FROM bookings b
    WHERE vr.booking_id = b.id
      AND (
        b.duration_mode IN ('fixed_stay', 'daily', 'weekly')
        OR b.stay_type = 'fixed_date_stay'
      )
      AND vr.deduction_paise > 0
      AND vr.status IN ('pending', 'approved')
  `);

  return { updated, rows: fixed };
}

export async function archiveStaleOperationalCheckouts(adminId: string): Promise<{
  archived: string[];
}> {
  const stale = await db.execute<{ id: string; full_name: string; booking_code: string }>(sql`
    SELECT cs.id::text AS id, c.full_name, b.booking_code
    FROM checkout_settlements cs
    JOIN customers c ON c.id = cs.customer_id
    JOIN bookings b ON b.id = cs.booking_id
    JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE cs.status NOT IN ('completed', 'refund_paid', 'archived')
      AND (
        vr.status IN ('completed', 'rejected')
        OR b.status IN ('cancelled', 'completed')
        OR NOT EXISTS (
          SELECT 1 FROM bed_reservations br
          WHERE br.booking_id = b.id
            AND br.kind = 'primary'
            AND br.status = 'active'
            AND CURRENT_DATE <@ br.stay_range
        )
      )
  `);

  const archived: string[] = [];
  for (const row of stale) {
    const res = await archiveCheckoutSettlement({ settlementId: row.id, adminId });
    if (res.ok) {
      archived.push(`${row.full_name} · ${row.booking_code} · ${row.id}`);
      await db.execute(sql`
        UPDATE vacating_requests vr
        SET checkout_settlement_suppressed = true,
            deduction_paise = CASE
              WHEN b.duration_mode IN ('fixed_stay', 'daily', 'weekly')
                OR b.stay_type = 'fixed_date_stay'
              THEN 0
              ELSE vr.deduction_paise
            END,
            notice_compliant = CASE
              WHEN b.duration_mode IN ('fixed_stay', 'daily', 'weekly')
                OR b.stay_type = 'fixed_date_stay'
              THEN true
              ELSE vr.notice_compliant
            END,
            updated_at = now()
        FROM checkout_settlements cs
        JOIN bookings b ON b.id = cs.booking_id
        WHERE cs.id = ${row.id}::uuid
          AND vr.id = cs.vacating_request_id
      `);
    }
  }
  return { archived };
}

export async function runCheckoutProductionRepairs(adminId: string) {
  const notice = await repairFixedStayNoticeDeductions(adminId);
  const repair = await executeCheckoutSettlementRepair({ adminId, dryRun: false });
  const continuous = await cleanupContinuousStayFalseCheckouts(adminId);
  const stale = await archiveStaleOperationalCheckouts(adminId);
  return { notice, repair, continuous, stale };
}
