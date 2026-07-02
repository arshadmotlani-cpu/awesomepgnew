/**
 * READ-ONLY investigation: resident auth for phone 7083608128
 * Usage: npx tsx scripts/investigate-resident-7083608128.ts
 */
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local', override: process.env.USE_PRODUCTION_DB === '1' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { indianLocalFromE164, normaliseIndianPhone } from '../src/lib/phone';
import { findCustomerByLoginIdentifier, parseLoginIdentifier } from '../src/lib/auth/loginIdentifier';
import { isAccountComplete, isIncompleteSignup } from '../src/lib/auth/customer';
import { collectSplitIdentityClusterIds } from '../src/lib/auth/customerIdentityMerge';

const TARGET = '7083608128';

async function main() {
  const { getDatabaseUrl } = await import('../src/lib/db/env');
  const dbUrl = getDatabaseUrl();
  const hostHint = dbUrl.replace(/:[^:@]+@/, ':***@').slice(0, 80);
  console.log('Database:', hostHint, process.env.USE_PRODUCTION_DB === '1' ? '(production override)' : '');

  const variants = [
    TARGET,
    `+91${TARGET}`,
    `91${TARGET}`,
    `0${TARGET}`,
    `+91 ${TARGET.slice(0, 5)} ${TARGET.slice(5)}`,
  ];

  const normalized = normaliseIndianPhone(TARGET);
  console.log('=== PHONE NORMALIZATION ===');
  console.log('Target:', TARGET);
  console.log('Normalized E.164:', normalized);
  for (const v of variants) {
    console.log(`  variant ${JSON.stringify(v)} -> ${normaliseIndianPhone(v)}`);
  }

  if (!normalized) {
    console.error('Could not normalize phone — aborting.');
    process.exit(1);
  }

  const phoneDigits = TARGET.replace(/\D/g, '');

  const customers = await db.execute(sql`
    SELECT *
    FROM customers
    WHERE phone = ${normalized}
       OR phone LIKE '%' || ${phoneDigits} || '%'
       OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || ${phoneDigits} || '%'
    ORDER BY created_at
  `);

  console.log('\n=== CUSTOMER RECORDS (phone match) ===');
  console.log('Count:', customers.length);
  for (const c of customers as Record<string, unknown>[]) {
    console.log(
      JSON.stringify(
        {
          id: c.id,
          fullName: c.full_name,
          email: c.email,
          phone: c.phone,
          phoneLocal: indianLocalFromE164(String(c.phone)),
          gender: c.gender,
          kycStatus: c.kyc_status,
          residencyStatus: c.residency_status,
          authProvider: c.auth_provider,
          hasPasswordHash: Boolean(c.password_hash),
          mustSetPassword: c.must_set_password,
          profileCompletedAt: c.profile_completed_at,
          isAccountComplete: isAccountComplete(c as never),
          isIncompleteSignup: isIncompleteSignup(c as never),
          archivedAt: c.archived_at,
          isTest: c.is_test,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        },
        null,
        2,
      ),
    );
  }

  const ids = (customers as { id: string }[]).map((c) => c.id);

  if (ids.length) {
    const bookings = await db.execute(sql`
      SELECT bk.id, bk.booking_code, bk.status, bk.customer_id, bk.duration_mode, bk.stay_type,
             bk.rent_paise_snapshot, bk.deposit_paise, bk.created_at,
             c.email AS customer_email, c.phone AS customer_phone, c.full_name, c.archived_at
      FROM bookings bk
      LEFT JOIN customers c ON c.id = bk.customer_id
      WHERE bk.customer_id = ANY(${ids}::uuid[])
         OR c.phone = ${normalized}
      ORDER BY bk.created_at
    `);
    console.log('\n=== BOOKINGS ===');
    console.log('Count:', bookings.length);
    for (const b of bookings as Record<string, unknown>[]) {
      console.log(JSON.stringify(b, null, 2));
    }

    const wallets = await db.execute(sql`
      SELECT w.id, w.customer_id, w.balance_paise, w.created_at, w.updated_at,
             c.email, c.phone, c.full_name, c.archived_at
      FROM wallets w
      LEFT JOIN customers c ON c.id = w.customer_id
      WHERE w.customer_id = ANY(${ids}::uuid[])
      ORDER BY w.created_at
    `);
    console.log('\n=== WALLETS ===');
    console.log('Count:', wallets.length);
    for (const w of wallets as Record<string, unknown>[]) {
      console.log(JSON.stringify(w, null, 2));
    }

    const kyc = await db.execute(sql`
      SELECT ks.id, ks.customer_id, ks.status, ks.submitted_at, ks.reviewed_at, ks.created_at,
             c.email, c.phone, c.full_name, c.archived_at
      FROM kyc_submissions ks
      LEFT JOIN customers c ON c.id = ks.customer_id
      WHERE ks.customer_id = ANY(${ids}::uuid[])
      ORDER BY ks.created_at
    `);
    console.log('\n=== KYC SUBMISSIONS ===');
    console.log('Count:', kyc.length);
    for (const k of kyc as Record<string, unknown>[]) {
      console.log(JSON.stringify(k, null, 2));
    }

    const invoices = await db.execute(sql`
      SELECT ri.id, ri.booking_id, ri.billing_month, ri.status, ri.total_paise, ri.created_at,
             bk.booking_code, bk.customer_id
      FROM rent_invoices ri
      INNER JOIN bookings bk ON bk.id = ri.booking_id
      WHERE bk.customer_id = ANY(${ids}::uuid[])
      ORDER BY ri.created_at DESC
      LIMIT 50
    `);
    console.log('\n=== RENT INVOICES (up to 50) ===');
    console.log('Count:', invoices.length);
    for (const i of invoices as Record<string, unknown>[]) {
      console.log(JSON.stringify(i, null, 2));
    }

    const elec = await db.execute(sql`
      SELECT ei.id, ei.booking_id, ei.billing_month, ei.status, ei.total_paise, ei.created_at,
             bk.booking_code
      FROM electricity_invoices ei
      INNER JOIN bookings bk ON bk.id = ei.booking_id
      WHERE bk.customer_id = ANY(${ids}::uuid[])
      ORDER BY ei.created_at DESC
      LIMIT 30
    `);
    console.log('\n=== ELECTRICITY INVOICES (up to 30) ===');
    console.log('Count:', elec.length);
    for (const e of elec as Record<string, unknown>[]) {
      console.log(JSON.stringify(e, null, 2));
    }
  }

  const dupPhone = await db.execute(sql`
    SELECT phone, count(*)::int AS cnt,
           array_agg(id ORDER BY created_at) AS ids,
           array_agg(email ORDER BY created_at) AS emails,
           array_agg(full_name ORDER BY created_at) AS names
    FROM customers
    WHERE archived_at IS NULL AND phone IS NOT NULL AND phone != ''
    GROUP BY phone
    HAVING count(*) > 1
  `);
  const relevantDup = (dupPhone as { phone: string }[]).filter(
    (r) => r.phone === normalized || r.phone?.includes(phoneDigits),
  );
  console.log('\n=== DUPLICATE ACTIVE PHONES (relevant) ===');
  console.log(JSON.stringify(relevantDup, null, 2));

  const emails = (customers as { email: string }[]).map((c) => c.email);
  if (emails.length) {
    const dupEmail = await db.execute(sql`
      SELECT email, count(*)::int AS cnt,
             array_agg(id ORDER BY created_at) AS ids,
             array_agg(phone ORDER BY created_at) AS phones,
             array_agg(full_name ORDER BY created_at) AS names
      FROM customers
      WHERE archived_at IS NULL
      GROUP BY email
      HAVING count(*) > 1
        AND email = ANY(${emails}::citext[])
    `);
    console.log('\n=== DUPLICATE ACTIVE EMAILS (for matched customers) ===');
    console.log(JSON.stringify(dupEmail, null, 2));
  }

  const signup = await db.execute(sql`
    SELECT id, email, full_name, phone, otp_verified, profile_submitted, status, expires_at, created_at
    FROM signup_sessions
    WHERE phone = ${normalized}
       OR regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE '%' || ${phoneDigits} || '%'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log('\n=== SIGNUP SESSIONS (phone) ===');
  console.log('Count:', signup.length);
  for (const s of signup as Record<string, unknown>[]) {
    console.log(JSON.stringify(s, null, 2));
  }

  if (emails.length) {
    const signupEmail = await db.execute(sql`
      SELECT id, email, full_name, phone, otp_verified, profile_submitted, status, expires_at, created_at
      FROM signup_sessions
      WHERE email = ANY(${emails}::citext[])
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.log('\n=== SIGNUP SESSIONS (email) ===');
    console.log('Count:', signupEmail.length);
    for (const s of signupEmail as Record<string, unknown>[]) {
      console.log(JSON.stringify(s, null, 2));
    }
  }

  console.log('\n=== LOGIN LOOKUP SIMULATION ===');
  for (const input of [TARGET, normalized, `+91${TARGET}`]) {
    const parsed = parseLoginIdentifier(input);
    const found = await findCustomerByLoginIdentifier(input);
    console.log(
      'Input:',
      input,
      'parsed:',
      parsed,
      'found:',
      found
        ? {
            id: found.customer.id,
            email: found.customer.email,
            archived: Boolean(found.customer.archivedAt),
            hasPw: Boolean(found.customer.passwordHash),
            mustSetPassword: found.customer.mustSetPassword,
            complete: isAccountComplete(found.customer),
          }
        : null,
    );
  }

  for (const c of customers as { id: string; email: string }[]) {
    const emailFound = await findCustomerByLoginIdentifier(c.email);
    console.log('Email login for', c.email, '->', emailFound ? emailFound.customer.id : null);
  }

  for (const id of ids) {
    try {
      const cluster = await collectSplitIdentityClusterIds(id);
      console.log('\nSplit identity cluster for', id, ':', cluster);
    } catch (e) {
      console.log('Cluster error for', id, e);
    }
  }

  if (ids.length === 0) {
    console.log('\n=== ORPHAN/ARCHIVED-CUSTOMER BOOKINGS ===');
    console.log('[] (no customer ids)');
    console.log('\n=== ORPHAN/ARCHIVED WALLET ===');
    console.log('[] (no customer ids)');
    console.log('\n=== ORPHAN/ARCHIVED KYC ===');
    console.log('[] (no customer ids)');
  } else {
  const orphanBookings = await db.execute(sql`
    SELECT bk.id, bk.booking_code, bk.customer_id, bk.status, c.archived_at
    FROM bookings bk
    LEFT JOIN customers c ON c.id = bk.customer_id
    WHERE bk.customer_id = ANY(${ids}::uuid[])
      AND (c.id IS NULL OR c.archived_at IS NOT NULL)
  `);
  console.log('\n=== ORPHAN/ARCHIVED-CUSTOMER BOOKINGS ===');
  console.log(JSON.stringify(orphanBookings, null, 2));

  const orphanWallet = await db.execute(sql`
    SELECT w.id, w.customer_id, c.archived_at
    FROM wallets w
    LEFT JOIN customers c ON c.id = w.customer_id
    WHERE w.customer_id = ANY(${ids}::uuid[])
      AND (c.id IS NULL OR c.archived_at IS NOT NULL)
  `);
  console.log('\n=== ORPHAN/ARCHIVED WALLET ===');
  console.log(JSON.stringify(orphanWallet, null, 2));

  const orphanKyc = await db.execute(sql`
    SELECT ks.id, ks.customer_id, c.archived_at
    FROM kyc_submissions ks
    LEFT JOIN customers c ON c.id = ks.customer_id
    WHERE ks.customer_id = ANY(${ids}::uuid[])
      AND (c.id IS NULL OR c.archived_at IS NOT NULL)
  `);
  console.log('\n=== ORPHAN/ARCHIVED KYC ===');
  console.log(JSON.stringify(orphanKyc, null, 2));
  }

  if (ids.length) {
    const sessions = await db.execute(sql`
      SELECT id, subject_id, remember_me, expires_at, last_seen_at, created_at, ip
      FROM auth_sessions
      WHERE kind = 'customer' AND subject_id = ANY(${ids}::uuid[])
      ORDER BY last_seen_at DESC NULLS LAST
      LIMIT 20
    `);
    console.log('\n=== AUTH SESSIONS ===');
    console.log(JSON.stringify(sessions, null, 2));
  }

  const loginAttempts = await db.execute(sql`
    SELECT email, success, reason, created_at
    FROM login_attempts
    WHERE email IN (
      SELECT email::text FROM customers
      WHERE phone = ${normalized}
         OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || ${phoneDigits} || '%'
    )
    ORDER BY created_at DESC
    LIMIT 15
  `);
  console.log('\n=== RECENT LOGIN ATTEMPTS (by customer email) ===');
  console.log(JSON.stringify(loginAttempts, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
