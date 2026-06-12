import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { getBusinessMetricsSummary } from '../src/db/queries/admin';

async function main() {
  const deductions = await db.execute<{
    id: string;
    booking_id: string;
    amount_paise: number;
    reason: string;
    created_at: string;
    booking_code: string;
    full_name: string;
    email: string;
    phone: string;
  }>(sql`
    SELECT dl.id, dl.booking_id::text, dl.amount_paise::bigint::int, dl.reason, dl.created_at,
           bk.booking_code, c.full_name, c.email, c.phone
    FROM deposit_ledger dl
    INNER JOIN bookings bk ON bk.id = dl.booking_id
    INNER JOIN customers c ON c.id = dl.customer_id
    WHERE dl.created_at >= '2026-06-01'::timestamptz
      AND dl.created_at < '2026-07-01'::timestamptz
      AND dl.entry_kind = 'deducted'
    ORDER BY dl.created_at DESC
  `);

  console.log('June 2026 deposit deductions:');
  for (const r of deductions) {
    console.log(
      `- ${r.booking_code} | ${r.full_name} | ${r.email} | ₹${Math.abs(r.amount_paise) / 100} | ${r.reason}`,
    );
  }

  const active = await db.execute<{
    booking_code: string;
    status: string;
    full_name: string;
    email: string;
    bed_code: string;
    room_number: string;
    pg_name: string;
    res_status: string;
  }>(sql`
    SELECT bk.booking_code, bk.status, c.full_name, c.email, b.bed_code, r.room_number, p.name as pg_name,
           br.status as res_status
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE br.status IN ('active','hold')
      AND CURRENT_DATE <@ br.stay_range
    ORDER BY bk.created_at DESC
  `);

  console.log('\nActive/hold reservations today:');
  for (const r of active) {
    console.log(
      `- ${r.pg_name} R${r.room_number} ${r.bed_code} | ${r.booking_code} | ${r.full_name} | ${r.email} | ${r.status}/${r.res_status}`,
    );
  }

  const metrics = await getBusinessMetricsSummary('2026-06-01');
  if (metrics.ok) {
    console.log('\nJune 2026 overview summary:');
    console.log(
      `extraIncome ₹${metrics.data.extraIncomePaise / 100} (other ₹${metrics.data.otherDeductionPaise / 100}, vacating ₹${metrics.data.vacatingDeductionPaise / 100}, late ₹${metrics.data.lateFeePaise / 100})`,
    );
    console.log(`occupied ${metrics.data.occupiedBeds}/${metrics.data.totalBeds}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
