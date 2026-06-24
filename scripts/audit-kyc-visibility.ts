/* eslint-disable no-console */
/**
 * P0 KYC visibility audit — trace residents with profile warnings vs queue/notifications/ops.
 */
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
loadScriptEnv();
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { closeDb, createClient } from '../src/db/client';
import {
  actionItems,
  adminNotifications,
  customers,
  kycSubmissions,
} from '../src/db/schema';
import { buildResident360Workflow } from '../src/lib/residents/resident360Workflow';
import { listPendingKycSubmissions } from '../src/services/kyc';

async function main() {
  const nameFilter = process.argv[2] ?? 'Dhairya';
  const { db } = createClient({ max: 1 });

  console.log(`\n=== KYC Visibility Audit (${nameFilter}) ===\n`);

  const residents = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      phone: customers.phone,
      kycStatus: customers.kycStatus,
      residencyStatus: customers.residencyStatus,
      profileCompletedAt: customers.profileCompletedAt,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(
      or(
        ilike(customers.fullName, `%${nameFilter}%`),
        ilike(customers.email, `%${nameFilter}%`),
      ),
    )
    .orderBy(desc(customers.createdAt));

  if (residents.length === 0) {
    console.log('No customers matched.');
    await closeDb();
    return;
  }

  const pendingQueue = await listPendingKycSubmissions();
  const pendingIds = new Set(pendingQueue.map((p) => p.customerId));

  for (const c of residents) {
    console.log('---');
    console.log(`Customer: ${c.fullName} (${c.id})`);
    console.log(`  kyc_status: ${c.kycStatus}`);
    console.log(`  residency: ${c.residencyStatus}`);

    const subs = await db
      .select()
      .from(kycSubmissions)
      .where(eq(kycSubmissions.customerId, c.id))
      .orderBy(desc(kycSubmissions.createdAt));

    console.log(`  kyc_submissions: ${subs.length}`);
    for (const s of subs) {
      console.log(
        `    - ${s.id} status=${s.status} created=${s.createdAt.toISOString()} booking=${s.bookingId ?? 'null'}`,
      );
    }

    const latest = subs[0] ?? null;
    const pendingKycSubmissionId =
      latest?.status === 'pending' ? latest.id : null;

    const workflow = buildResident360Workflow({
      customerId: c.id,
      customerName: c.fullName,
      kycStatus: c.kycStatus,
      pendingKycSubmissionId,
      hasActiveTenancy: false,
      hasBed: false,
      bookingId: null,
      financialSummary: null,
      residencyStatus: c.residencyStatus,
    });

    const profileShowsKycWarning = workflow.stateLine.includes('identity review required');
    const inKycQueue = pendingIds.has(c.id);

    const actions = await db
      .select()
      .from(actionItems)
      .where(
        and(eq(actionItems.residentId, c.id), eq(actionItems.status, 'open')),
      );

    const kycActions = actions.filter((a) => a.type === 'kyc_pending');

    const notifs = await db
      .select()
      .from(adminNotifications)
      .where(
        and(
          eq(adminNotifications.residentId, c.id),
          sql`${adminNotifications.type} = 'kyc_pending'`,
        ),
      );

    console.log(`  Profile warning (identity review): ${profileShowsKycWarning}`);
    console.log(`  stateLine: ${workflow.stateLine}`);
    console.log(`  In KYC queue (pending submission): ${inKycQueue}`);
    console.log(`  Open kyc_pending action_items: ${kycActions.length}`);
    for (const a of kycActions) {
      console.log(`    - ${a.id} sourceKey=${a.sourceKey}`);
    }
    console.log(`  admin_notifications (kyc_pending): ${notifs.length}`);

    // Payments / verification
    const verify = await db.execute<{
      is_verified: boolean;
      verified_via_kyc: boolean;
      verified_via_payment: boolean;
      has_pending_kyc: boolean;
    }>(sql`
      SELECT
        (
          c.kyc_status = 'approved'
          OR EXISTS (
            SELECT 1 FROM payments p
            INNER JOIN bookings b ON b.id = p.booking_id
            WHERE b.customer_id = c.id AND p.status = 'succeeded'
          )
          OR EXISTS (
            SELECT 1 FROM pg_payment_records pr
            WHERE pr.customer_id = c.id AND pr.status = 'approved'
          )
        ) AS is_verified,
        (c.kyc_status = 'approved') AS verified_via_kyc,
        (
          EXISTS (
            SELECT 1 FROM payments p
            INNER JOIN bookings b ON b.id = p.booking_id
            WHERE b.customer_id = c.id AND p.status = 'succeeded'
          )
          OR EXISTS (
            SELECT 1 FROM pg_payment_records pr
            WHERE pr.customer_id = c.id AND pr.status = 'approved'
          )
        ) AS verified_via_payment,
        EXISTS (
          SELECT 1 FROM kyc_submissions ks
          WHERE ks.customer_id = c.id AND ks.status = 'pending'
        ) AS has_pending_kyc
      FROM customers c
      WHERE c.id = ${c.id}::uuid
    `);
    const v = verify[0];
    console.log(`  verified: ${v?.is_verified} via_kyc=${v?.verified_via_kyc} via_payment=${v?.verified_via_payment}`);
    console.log(`  has_pending_kyc_submission: ${v?.has_pending_kyc}`);

    if (profileShowsKycWarning && !inKycQueue) {
      console.log('  ⚠ INCONSISTENCY: profile warns but no KYC queue item');
    }
  }

  // Broader audit: all residents with profile-style KYC warning conditions
  console.log('\n=== Broader inconsistency scan ===\n');

  const allVerifiedResidents = await db.execute<{
    id: string;
    full_name: string;
    kyc_status: string;
    has_pending_sub: boolean;
  }>(sql`
    SELECT c.id, c.full_name, c.kyc_status,
      EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      ) AS has_pending_sub
    FROM customers c
    WHERE c.archived_at IS NULL
      AND c.kyc_status = 'pending'
      AND (
        c.kyc_status = 'approved'
        OR EXISTS (
          SELECT 1 FROM payments p
          INNER JOIN bookings b ON b.id = p.booking_id
          WHERE b.customer_id = c.id AND p.status = 'succeeded'
        )
        OR EXISTS (
          SELECT 1 FROM pg_payment_records pr
          WHERE pr.customer_id = c.id AND pr.status = 'approved'
        )
      )
    ORDER BY c.full_name
  `);

  const inconsistent = allVerifiedResidents.filter((r) => !r.has_pending_sub);
  console.log(
    `Payment-verified residents with kyc_status=pending but NO pending submission: ${inconsistent.length}`,
  );
  for (const r of inconsistent.slice(0, 30)) {
    console.log(`  - ${r.full_name} (${r.id})`);
  }
  if (inconsistent.length > 30) {
    console.log(`  ... and ${inconsistent.length - 30} more`);
  }

  await closeDb();
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
