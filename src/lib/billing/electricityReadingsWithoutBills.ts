/**
 * Electricity Brain — detect readings / generation attempts without bills.
 *
 * RED alert copy: "Electricity readings exist but bills were not generated."
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type ElectricityReadingsWithoutBillsCode =
  | 'METER_LOG_WITHOUT_BILL'
  | 'GENERATION_JOB_FAILED_WITHOUT_BILL'
  | 'GENERATION_JOB_STUCK_WITHOUT_BILL'
  | 'BILL_WITHOUT_INVOICES';

export type ElectricityReadingsWithoutBillsFinding = {
  code: ElectricityReadingsWithoutBillsCode;
  severity: 'P0';
  roomId: string;
  roomNumber: string | null;
  pgName: string | null;
  billingMonth: string;
  detail: string;
};

export type ElectricityReadingsWithoutBillsReport = {
  asOf: string;
  billingMonth: string;
  findings: ElectricityReadingsWithoutBillsFinding[];
  pass: boolean;
  /** Canonical RED alert when !pass */
  alertMessage: string | null;
};

type Row = Record<string, unknown>;

function asRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return [];
}

const STUCK_RUNNING_MINUTES = 30;

/**
 * Pure message for System Health / Health Brain surfaces.
 */
export function electricityReadingsWithoutBillsAlertMessage(
  findingCount: number,
): string {
  if (findingCount <= 0) return '';
  return 'Electricity readings exist but bills were not generated.';
}

export async function runElectricityReadingsWithoutBillsAudit(opts: {
  billingMonth: string;
}): Promise<ElectricityReadingsWithoutBillsReport> {
  const billingMonth = opts.billingMonth;
  const findings: ElectricityReadingsWithoutBillsFinding[] = [];

  const meterLogsWithoutBill = asRows(
    await db.execute(sql`
      SELECT DISTINCT ON (ml.room_id)
        ml.room_id::text AS room_id,
        r.room_number,
        p.name AS pg_name,
        ml.units::text AS units,
        ml.recorded_at::text AS recorded_at
      FROM meter_logs ml
      JOIN rooms r ON r.id = ml.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      JOIN room_types rt ON rt.id = r.room_type_id AND rt.has_ac = true
      WHERE ml.reading_type = 'monthly'
        AND date_trunc('month', ml.recorded_at::timestamp)::date = ${billingMonth}::date
        AND NOT EXISTS (
          SELECT 1 FROM electricity_bills eb
          WHERE eb.room_id = ml.room_id
            AND eb.billing_month = ${billingMonth}::date
            AND coalesce(eb.is_pipeline_test, false) = false
        )
        AND EXISTS (
          SELECT 1
          FROM beds bd
          JOIN bed_reservations br ON br.bed_id = bd.id
            AND br.status IN ('active', 'completed') AND br.kind = 'primary'
            AND br.stay_range && daterange(
              ${billingMonth}::date,
              (${billingMonth}::date + interval '1 month')::date,
              '[)'
            )
          JOIN bookings b ON b.id = br.booking_id AND b.status = 'confirmed'
            AND b.duration_mode IN ('monthly', 'open_ended')
          WHERE bd.room_id = ml.room_id
        )
      ORDER BY ml.room_id, ml.recorded_at DESC
      LIMIT 50
    `),
  );

  for (const row of meterLogsWithoutBill) {
    findings.push({
      code: 'METER_LOG_WITHOUT_BILL',
      severity: 'P0',
      roomId: String(row.room_id),
      roomNumber: row.room_number != null ? String(row.room_number) : null,
      pgName: row.pg_name != null ? String(row.pg_name) : null,
      billingMonth,
      detail: `Monthly meter log (${row.units} units @ ${row.recorded_at}) but no electricity bill for ${billingMonth}`,
    });
  }

  const failedJobs = asRows(
    await db.execute(sql`
      SELECT
        j.room_id::text AS room_id,
        r.room_number,
        p.name AS pg_name,
        j.status::text AS job_status,
        j.error_message,
        j.started_at::text AS started_at
      FROM electricity_bill_generation_jobs j
      JOIN rooms r ON r.id = j.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE j.billing_month = ${billingMonth}::date
        AND j.status = 'failed'
        AND j.bill_id IS NULL
        AND coalesce(j.error_message, '') NOT ILIKE '%BROWSER_VERIFY%'
        AND coalesce(j.error_message, '') NOT ILIKE 'cleanup'
        AND NOT EXISTS (
          SELECT 1 FROM electricity_bills eb
          WHERE eb.room_id = j.room_id
            AND eb.billing_month = j.billing_month
            AND coalesce(eb.is_pipeline_test, false) = false
        )
      ORDER BY j.started_at DESC
      LIMIT 50
    `),
  );

  for (const row of failedJobs) {
    findings.push({
      code: 'GENERATION_JOB_FAILED_WITHOUT_BILL',
      severity: 'P0',
      roomId: String(row.room_id),
      roomNumber: row.room_number != null ? String(row.room_number) : null,
      pgName: row.pg_name != null ? String(row.pg_name) : null,
      billingMonth,
      detail: `Generation job failed without bill: ${row.error_message ?? 'no error_message'}`,
    });
  }

  const stuckJobs = asRows(
    await db.execute(sql`
      SELECT
        j.room_id::text AS room_id,
        r.room_number,
        p.name AS pg_name,
        j.started_at::text AS started_at
      FROM electricity_bill_generation_jobs j
      JOIN rooms r ON r.id = j.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE j.billing_month = ${billingMonth}::date
        AND j.status = 'running'
        AND j.finished_at IS NULL
        AND j.started_at < now() - make_interval(mins => ${STUCK_RUNNING_MINUTES})
        AND j.bill_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM electricity_bills eb
          WHERE eb.room_id = j.room_id
            AND eb.billing_month = j.billing_month
            AND coalesce(eb.is_pipeline_test, false) = false
        )
      ORDER BY j.started_at
      LIMIT 50
    `),
  );

  for (const row of stuckJobs) {
    findings.push({
      code: 'GENERATION_JOB_STUCK_WITHOUT_BILL',
      severity: 'P0',
      roomId: String(row.room_id),
      roomNumber: row.room_number != null ? String(row.room_number) : null,
      pgName: row.pg_name != null ? String(row.pg_name) : null,
      billingMonth,
      detail: `Generation job stuck running since ${row.started_at} with no bill`,
    });
  }

  const billsWithoutInvoices = asRows(
    await db.execute(sql`
      SELECT
        eb.id::text AS bill_id,
        eb.room_id::text AS room_id,
        r.room_number,
        p.name AS pg_name,
        eb.units_consumed::text AS units
      FROM electricity_bills eb
      JOIN rooms r ON r.id = eb.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE eb.billing_month = ${billingMonth}::date
        AND coalesce(eb.is_pipeline_test, false) = false
        AND eb.units_consumed::numeric > 0
        AND NOT EXISTS (
          SELECT 1 FROM electricity_invoices ei
          WHERE ei.electricity_bill_id = eb.id
            AND ei.status <> 'cancelled'
        )
        AND EXISTS (
          SELECT 1
          FROM beds bd
          JOIN bed_reservations br ON br.bed_id = bd.id
            AND br.status IN ('active', 'completed') AND br.kind = 'primary'
            AND br.stay_range && daterange(
              ${billingMonth}::date,
              (${billingMonth}::date + interval '1 month')::date,
              '[)'
            )
          JOIN bookings b ON b.id = br.booking_id AND b.status = 'confirmed'
            AND b.duration_mode IN ('monthly', 'open_ended')
            AND coalesce(b.is_test, false) = false
          JOIN customers c ON c.id = b.customer_id
            AND c.residency_status NOT IN ('vacated', 'blocked')
            AND coalesce(c.is_test, false) = false
          WHERE bd.room_id = eb.room_id
        )
      ORDER BY p.name, r.room_number
      LIMIT 50
    `),
  );

  for (const row of billsWithoutInvoices) {
    findings.push({
      code: 'BILL_WITHOUT_INVOICES',
      severity: 'P0',
      roomId: String(row.room_id),
      roomNumber: row.room_number != null ? String(row.room_number) : null,
      pgName: row.pg_name != null ? String(row.pg_name) : null,
      billingMonth,
      detail: `Bill ${row.bill_id} has ${row.units} units and eligible occupants but zero active invoices`,
    });
  }

  const pass = findings.length === 0;
  return {
    asOf: new Date().toISOString(),
    billingMonth,
    findings,
    pass,
    alertMessage: pass ? null : electricityReadingsWithoutBillsAlertMessage(findings.length),
  };
}
