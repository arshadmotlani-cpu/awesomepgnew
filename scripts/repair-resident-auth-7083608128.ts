/**
 * Repair auth for Harshal Deotale / phone 7083608128.
 * - Unarchive canonical customer
 * - Expire conflicting signup session
 * - Fix display name
 *
 * Usage:
 *   DATABASE_URL="$(grep '^DATABASE_URL=' .env.local.ci-bak | cut -d= -f2-)" \
 *     npx tsx scripts/repair-resident-auth-7083608128.ts
 */
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { auditLog, customers, signupSessions } from '../src/db/schema';
import { findCustomerByLoginIdentifier } from '../src/lib/auth/loginIdentifier';
import { isAccountComplete } from '../src/lib/auth/customer';
import { normaliseIndianPhone } from '../src/lib/phone';

const CUSTOMER_ID = 'bc9aa020-93c2-454e-90a4-9a4a92cc5611';
const SIGNUP_SESSION_ID = 'b461ad35-293b-45dc-a77a-816a871011c6';
const CANONICAL_EMAIL = 'harshaddeotale75757@gmail.com';
const CANONICAL_NAME = 'Harshal Deotale';
const PHONE = '7083608128';

async function main() {
  const { getDatabaseUrl } = await import('../src/lib/db/env');
  console.log('Database:', getDatabaseUrl().replace(/:[^:@]+@/, ':***@').slice(0, 80));

  const [before] = await db.select().from(customers).where(eq(customers.id, CUSTOMER_ID)).limit(1);
  if (!before) {
    console.error('Customer not found:', CUSTOMER_ID);
    process.exit(1);
  }

  const [signupBefore] = await db
    .select()
    .from(signupSessions)
    .where(eq(signupSessions.id, SIGNUP_SESSION_ID))
    .limit(1);

  console.log('\n=== BEFORE ===');
  console.log({
    id: before.id,
    fullName: before.fullName,
    email: before.email,
    phone: before.phone,
    archivedAt: before.archivedAt,
    hasPassword: Boolean(before.passwordHash),
    mustSetPassword: before.mustSetPassword,
  });
  console.log('signupSession:', signupBefore
    ? {
        id: signupBefore.id,
        email: signupBefore.email,
        phone: signupBefore.phone,
        status: signupBefore.status,
        expiresAt: signupBefore.expiresAt,
      }
    : 'not found');

  const phoneLoginBefore = await findCustomerByLoginIdentifier(PHONE);
  const emailLoginBefore = await findCustomerByLoginIdentifier(CANONICAL_EMAIL);
  console.log('loginByPhone:', phoneLoginBefore ? 'ok' : 'blocked');
  console.log('loginByEmail:', emailLoginBefore ? 'ok' : 'blocked');

  await db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(customers)
      .set({
        archivedAt: null,
        fullName: CANONICAL_NAME,
        updatedAt: now,
      })
      .where(eq(customers.id, CUSTOMER_ID));

    if (signupBefore) {
      await tx
        .update(signupSessions)
        .set({
          status: 'expired',
          expiresAt: now,
          updatedAt: now,
        })
        .where(eq(signupSessions.id, SIGNUP_SESSION_ID));
    }

    await tx.insert(auditLog).values({
      actorType: 'system',
      entity: 'customer_auth',
      entityId: CUSTOMER_ID,
      action: 'resident_auth_repair_unarchive',
      diff: {
        phone: normaliseIndianPhone(PHONE),
        email: CANONICAL_EMAIL,
        previousArchivedAt: before.archivedAt?.toISOString() ?? null,
        previousFullName: before.fullName,
        expiredSignupSessionId: signupBefore?.id ?? null,
        expiredSignupSessionEmail: signupBefore?.email ?? null,
        reason: 'Archived customer blocked login; stale signup session conflicted on same phone',
      },
    });
  });

  const [after] = await db.select().from(customers).where(eq(customers.id, CUSTOMER_ID)).limit(1);
  const [signupAfter] = await db
    .select()
    .from(signupSessions)
    .where(eq(signupSessions.id, SIGNUP_SESSION_ID))
    .limit(1);

  const phoneLoginAfter = await findCustomerByLoginIdentifier(PHONE);
  const emailLoginAfter = await findCustomerByLoginIdentifier(CANONICAL_EMAIL);

  console.log('\n=== AFTER ===');
  console.log({
    id: after?.id,
    fullName: after?.fullName,
    email: after?.email,
    phone: after?.phone,
    archivedAt: after?.archivedAt,
    accountComplete: after ? isAccountComplete(after) : false,
  });
  console.log('signupSession:', signupAfter
    ? { status: signupAfter.status, expiresAt: signupAfter.expiresAt }
    : 'not found');
  console.log('loginByPhone:', phoneLoginAfter
    ? { id: phoneLoginAfter.customer.id, email: phoneLoginAfter.customer.email }
    : 'FAILED');
  console.log('loginByEmail:', emailLoginAfter
    ? { id: emailLoginAfter.customer.id, email: emailLoginAfter.customer.email }
    : 'FAILED');

  if (!phoneLoginAfter || !emailLoginAfter) {
    console.error('\nRepair verification FAILED — login lookup still blocked.');
    process.exit(1);
  }

  console.log('\n✓ Repair complete. Resident can sign in with:');
  console.log(`  Phone: ${PHONE}`);
  console.log(`  Email: ${CANONICAL_EMAIL}`);
  console.log('  If password forgotten: Forgot password → enter phone → OTP to registered email.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
