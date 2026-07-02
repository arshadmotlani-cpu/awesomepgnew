/**
 * Investigation: Room 102 B1 occupancy + Harshal Deotale auth identity.
 * Usage: npx tsx scripts/investigate-room102-harshal.ts
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { deriveCustomerBedAvailabilityView } from '../src/lib/bedAvailabilityState';
import { customerBookableFromDate } from '../src/lib/dates';
import { findCustomerByPhone, findCustomerByEmail } from '../src/lib/auth/customer';
import { normaliseIndianPhone } from '../src/lib/phone';

async function investigateRoom102B1() {
  console.log('\n=== ROOM 102 B1 INVESTIGATION ===\n');

  type BedRow = {
    bed_id: string;
    bed_code: string;
    room_number: string;
    pg_name: string;
    pg_slug: string;
    bed_status: string;
    manual_occupied: boolean;
    is_available_now: boolean;
    next_available_date: string | null;
    vacating_date: string | null;
    vacating_status: string | null;
    reserved_from: string | null;
    active_reserve_check_in: string | null;
  };

  const beds = await db.execute<BedRow>(sql`
    SELECT
      bd.id AS bed_id,
      bd.bed_code,
      r.room_number,
      p.name AS pg_name,
      p.slug AS pg_slug,
      bd.status AS bed_status,
      bd.manual_occupied,
      (
        bd.status = 'available'
        AND NOT bd.manual_occupied
        AND NOT EXISTS (
          SELECT 1 FROM bed_reservations br
          WHERE br.bed_id = bd.id
            AND br.status = 'active'
            AND CURRENT_DATE <@ br.stay_range
        )
      ) AS is_available_now,
      (
        SELECT to_char(sub.d, 'YYYY-MM-DD')
        FROM (
          SELECT max(upper(br.stay_range)) AS d
          FROM bed_reservations br
          WHERE br.bed_id = bd.id
            AND br.status = 'active'
            AND lower(br.stay_range) <= CURRENT_DATE
            AND upper(br.stay_range) > CURRENT_DATE
        ) sub
        WHERE sub.d IS NOT NULL AND sub.d < '2090-01-01'::date
      ) AS next_available_date,
      (
        SELECT vr.vacating_date::text
        FROM bed_reservations br
        INNER JOIN bookings bk ON bk.id = br.booking_id
        INNER JOIN vacating_requests vr ON vr.booking_id = bk.id
        WHERE br.bed_id = bd.id
          AND br.status = 'active'
          AND CURRENT_DATE <@ br.stay_range
          AND vr.status IN ('pending', 'approved')
        LIMIT 1
      ) AS vacating_date,
      (
        SELECT vr.status
        FROM bed_reservations br
        INNER JOIN bookings bk ON bk.id = br.booking_id
        INNER JOIN vacating_requests vr ON vr.booking_id = bk.id
        WHERE br.bed_id = bd.id
          AND br.status = 'active'
          AND CURRENT_DATE <@ br.stay_range
          AND vr.status IN ('pending', 'approved')
        LIMIT 1
      ) AS vacating_status,
      (
        SELECT lower(br.stay_range)::text
        FROM bed_reservations br
        INNER JOIN bookings bk ON bk.id = br.booking_id
        WHERE br.bed_id = bd.id
          AND br.status = 'active'
          AND bk.status = 'confirmed'
          AND lower(br.stay_range) > CURRENT_DATE
        LIMIT 1
      ) AS reserved_from,
      (
        SELECT brh.check_in_date::text
        FROM bed_reserve_holds brh
        WHERE brh.bed_id = bd.id
          AND brh.status = 'active'
          AND brh.reserve_start <= CURRENT_DATE
          AND brh.check_in_date >= CURRENT_DATE
        LIMIT 1
      ) AS active_reserve_check_in
    FROM beds bd
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE r.room_number = '102'
      AND bd.bed_code = 'B1'
    ORDER BY p.name
  `);

  if (beds.length === 0) {
    console.log('No bed found for Room 102 B1');
    return;
  }

  for (const bed of beds) {
    console.log(`PG: ${bed.pg_name} (${bed.pg_slug})`);
    console.log(`Bed ID: ${bed.bed_id}`);
    console.log(`Bed status column: ${bed.bed_status}, manual_occupied: ${bed.manual_occupied}`);
    console.log(`getRoomDetail flags:`);
    console.log(`  isAvailableNow: ${bed.is_available_now}`);
    console.log(`  nextAvailableDate: ${bed.next_available_date}`);
    console.log(`  vacatingDate: ${bed.vacating_date}`);
    console.log(`  vacatingStatus: ${bed.vacating_status}`);
    console.log(`  reservedFrom: ${bed.reserved_from}`);
    console.log(`  activeBedReserveCheckIn: ${bed.active_reserve_check_in}`);

    const view = deriveCustomerBedAvailabilityView({
      bedStatus: bed.bed_status as 'available' | 'maintenance' | 'blocked',
      manualOccupied: bed.manual_occupied,
      isAvailableNow: bed.is_available_now,
      nextAvailableDate: bed.next_available_date,
      vacatingDate: bed.vacating_date,
      vacatingStatus: bed.vacating_status as 'pending' | 'approved' | null,
      reservedFrom: bed.reserved_from,
      activeBedReserveCheckIn: bed.active_reserve_check_in,
      interestCount: 0,
      noticeInterestCount: 0,
      availableUntilDate: null,
    });
    console.log(`deriveCustomerBedAvailabilityView output:`);
    console.log(`  kind: ${view.kind}`);
    console.log(`  label: ${view.label}`);
    console.log(`  sublabel: ${view.sublabel}`);
    console.log(`  customerBookableFromDate(nextAvailable): ${customerBookableFromDate(bed.next_available_date)}`);

    type BookingRow = {
      booking_id: string;
      booking_code: string;
      customer_id: string;
      full_name: string;
      email: string;
      phone: string;
      booking_status: string;
      duration_mode: string;
      stay_type: string | null;
      residency_status: string;
      check_in: string;
      check_out: string | null;
      res_status: string;
      res_kind: string;
      rent_paise: number | null;
      deposit_paise: number | null;
      vacating_id: string | null;
      vacating_status: string | null;
      vacating_date: string | null;
      vacating_approved_at: string | null;
    };

    const bookings = await db.execute<BookingRow>(sql`
      SELECT
        bk.id AS booking_id,
        bk.booking_code,
        c.id AS customer_id,
        c.full_name,
        c.email,
        c.phone,
        bk.status AS booking_status,
        bk.duration_mode,
        bk.stay_type,
        c.residency_status,
        lower(br.stay_range)::text AS check_in,
        CASE WHEN upper(br.stay_range) >= '2090-01-01'::date THEN NULL
             ELSE upper(br.stay_range)::text END AS check_out,
        br.status AS res_status,
        br.kind AS res_kind,
        bk.rent_paise_snapshot AS rent_paise,
        bk.deposit_paise,
        vr.id AS vacating_id,
        vr.status AS vacating_status,
        vr.vacating_date::text AS vacating_date,
        vr.approved_at::text AS vacating_approved_at
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      INNER JOIN customers c ON c.id = bk.customer_id
      LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status NOT IN ('cancelled', 'rejected')
      WHERE br.bed_id = ${bed.bed_id}
      ORDER BY br.updated_at DESC
      LIMIT 10
    `);

    console.log('\nReservations / bookings on this bed:');
    for (const b of bookings) {
      console.log('---');
      console.log(`Booking ID: ${b.booking_id}`);
      console.log(`Booking code: ${b.booking_code}`);
      console.log(`Resident: ${b.full_name} (${b.customer_id})`);
      console.log(`Email: ${b.email}`);
      console.log(`Phone: ${b.phone}`);
      console.log(`Booking status: ${b.booking_status}`);
      console.log(`Duration mode: ${b.duration_mode}`);
      console.log(`Stay type: ${b.stay_type}`);
      console.log(`Residency status: ${b.residency_status}`);
      console.log(`Reservation: ${b.res_kind} / ${b.res_status}`);
      console.log(`Check-in: ${b.check_in}`);
      console.log(`Check-out: ${b.check_out ?? 'open-ended'}`);
      console.log(`Rent snapshot: ${b.rent_paise} paise`);
      console.log(`Deposit: ${b.deposit_paise} paise`);
      console.log(`Move-out request: ${b.vacating_id ? `yes (${b.vacating_status}, date ${b.vacating_date}, approved ${b.vacating_approved_at})` : 'none'}`);
      console.log(`Checked in?: ${b.res_status === 'active' && b.booking_status === 'confirmed' ? 'YES' : 'NO'}`);
    }
  }
}

async function investigateHarshal() {
  console.log('\n=== HARSHAL DEOTALE AUTH INVESTIGATION ===\n');
  const phone = normaliseIndianPhone('7083608128');
  console.log(`Normalised phone: ${phone}`);

  const byPhone = phone ? await findCustomerByPhone(phone) : null;
  console.log('\nfindCustomerByPhone:');
  console.log(byPhone ? JSON.stringify(byPhone, null, 2) : 'NOT FOUND');

  type CustomerRow = {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    password_hash: string | null;
    email_verified_at: string | null;
    archived_at: string | null;
    residency_status: string;
    is_test: boolean;
    created_at: string;
  };

  const byName = await db.execute<CustomerRow>(sql`
    SELECT id, full_name, email, phone, password_hash IS NOT NULL AS has_password,
           email_verified_at::text, archived_at::text, residency_status, is_test, created_at::text
    FROM customers
    WHERE full_name ILIKE '%Harshal%Deotale%'
       OR full_name ILIKE '%Deotale%'
       OR phone = ${phone ?? '+917083608128'}
    ORDER BY created_at
  `);
  console.log('\nCustomers matching name/phone:');
  console.log(JSON.stringify(byName, null, 2));

  const dupPhones = await db.execute(sql`
    SELECT phone, count(*)::int AS cnt, array_agg(id) AS customer_ids, array_agg(full_name) AS names
    FROM customers
    WHERE archived_at IS NULL AND phone IS NOT NULL AND phone != ''
    GROUP BY phone
    HAVING count(*) > 1
  `);
  console.log('\nDuplicate active phones:');
  console.log(JSON.stringify(dupPhones, null, 2));

  const dupEmails = await db.execute(sql`
    SELECT email, count(*)::int AS cnt, array_agg(id) AS customer_ids
    FROM customers
    WHERE archived_at IS NULL
    GROUP BY email
    HAVING count(*) > 1
  `);
  console.log('\nDuplicate active emails:');
  console.log(JSON.stringify(dupEmails, null, 2));

  if (byPhone) {
    const bookings = await db.execute(sql`
      SELECT bk.id, bk.booking_code, bk.status, bd.bed_code, r.room_number, p.name AS pg_name
      FROM bookings bk
      LEFT JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary'
      LEFT JOIN beds bd ON bd.id = br.bed_id
      LEFT JOIN rooms r ON r.id = bd.room_id
      LEFT JOIN floors f ON f.id = r.floor_id
      LEFT JOIN pgs p ON p.id = f.pg_id
      WHERE bk.customer_id = ${byPhone.id}
      ORDER BY bk.created_at DESC
    `);
    console.log('\nBookings for phone owner:');
    console.log(JSON.stringify(bookings, null, 2));
  }

  const signupSessions = await db.execute(sql`
    SELECT id, email, phone, full_name, otp_verified, profile_submitted, created_at::text
    FROM signup_sessions
    WHERE phone = ${phone ?? '+917083608128'}
       OR email ILIKE '%harshal%'
       OR email ILIKE '%deotale%'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\nSignup sessions:');
  console.log(JSON.stringify(signupSessions, null, 2));
}

async function main() {
  await investigateRoom102B1();
  await investigateHarshal();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
