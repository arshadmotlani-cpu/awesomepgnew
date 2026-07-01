/* eslint-disable no-console */
/**
 * Local fixture for Express Booking E2E: Waqar Ahmad · Shantinagar · 203 · B3.
 *
 *   DATABASE_URL="postgres://$(whoami)@localhost:5432/awesomepg" \
 *   ADMIN_INITIAL_PASSWORD='dev-admin-pass' \
 *   npx tsx scripts/seed-express-booking-e2e.ts
 */
import 'dotenv/config';

import { eq, ilike } from 'drizzle-orm';
import { closeDb, createClient } from '../src/db/client';
import { adminUsers, customers, pgs } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth/crypto';
import { SEED_ADMIN_EMAIL } from '../src/lib/auth/adminPasswordReset';
import type { AdminSession } from '../src/lib/auth/session';
import { mergeOrUpsertCustomerForAdminWalkIn } from '../src/services/adminCustomerMerge';
import { assignTenantToBed } from '../src/services/tenantAssignment';
import { getActiveTenancyForCustomer } from '../src/lib/residentActiveTenancy';
import { bootstrapAdminIfNeeded } from '../src/lib/auth/bootstrapAdmin';

const WAQAR_NAME = 'Waqar Ahmad';
const WAQAR_PHONE = '+919988776655';
const BED_ID = 'f9498f7f-5f8f-416e-8f4d-4a45b522f9c9';
const SHANTINAGAR_NAME = 'Shantinagar - Awesome PG';

const session: AdminSession = {
  kind: 'admin',
  sessionId: 'seed-express-e2e',
  adminId: '00000000-0000-0000-0000-000000000001',
  email: SEED_ADMIN_EMAIL,
  fullName: 'E2E Admin',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86400000),
};

async function ensureAdmin() {
  await bootstrapAdminIfNeeded();
  const password = process.env.ADMIN_INITIAL_PASSWORD?.trim() ?? 'dev-admin-pass';
  const { db } = createClient({ max: 1 });
  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, SEED_ADMIN_EMAIL))
    .limit(1);
  if (!existing) {
    await db.insert(adminUsers).values({
      fullName: 'Super Admin',
      email: SEED_ADMIN_EMAIL,
      passwordHash: hashPassword(password),
      role: 'super_admin',
      pgScope: [],
      isActive: true,
      mustChangePassword: false,
    });
    console.log(`✓ Created admin ${SEED_ADMIN_EMAIL} (password from ADMIN_INITIAL_PASSWORD or dev-admin-pass)`);
  } else {
    console.log(`✓ Admin ${SEED_ADMIN_EMAIL} already exists`);
  }
}

async function ensureShantinagarPg() {
  const { db } = createClient({ max: 1 });
  const updated = await db
    .update(pgs)
    .set({ name: SHANTINAGAR_NAME, updatedAt: new Date() })
    .where(ilike(pgs.name, '%Koramangala%'))
    .returning({ id: pgs.id, name: pgs.name });
  if (updated[0]) {
    console.log(`✓ PG renamed to "${updated[0].name}"`);
  }
}

async function ensureWaqarTenancy() {
  const { db } = createClient({ max: 1 });
  const [adminRow] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, SEED_ADMIN_EMAIL))
    .limit(1);
  if (!adminRow) throw new Error('Admin user missing — run ensureAdmin first.');
  session.adminId = adminRow.id;

  const [existing] = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(ilike(customers.fullName, `%${WAQAR_NAME}%`))
    .limit(1);

  if (existing) {
    const tenancy = await getActiveTenancyForCustomer(existing.id);
    if (tenancy?.bedCode === 'B3' && tenancy.roomNumber === '203') {
      console.log(`✓ ${existing.fullName} already has active tenancy ${tenancy.pgName} · ${tenancy.roomNumber} · ${tenancy.bedCode}`);
      return existing.id;
    }
    console.log(`Assigning bed to existing customer ${existing.fullName}…`);
  }

  const checkInDate = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}-01`;

  const customerResult = existing
    ? { ok: true as const, customerId: existing.id }
    : await mergeOrUpsertCustomerForAdminWalkIn({
        fullName: WAQAR_NAME,
        phone: WAQAR_PHONE,
        gender: 'male',
        adminVerifiedKyc: true,
      });
  if (!customerResult.ok) {
    throw new Error(customerResult.error);
  }

  const result = await assignTenantToBed(session, {
    bedId: BED_ID,
    startDate: checkInDate,
    customerId: customerResult.customerId,
    fullName: WAQAR_NAME,
    email: `waqar.ahmad+${Date.now()}@residents.awesomepg.in`,
    phone: WAQAR_PHONE,
    gender: 'male',
    monthlyRentInr: 8000,
    depositInr: 8000,
    notes: 'Express Booking E2E fixture',
  });

  if (!result.ok) {
    throw new Error(`Failed to create Waqar tenancy: ${result.error}`);
  }

  console.log(`✓ Created ${WAQAR_NAME} · booking ${result.bookingCode}`);
  return customerResult.customerId;
}

async function main() {
  createClient({ max: 2 });
  await ensureAdmin();
  await ensureShantinagarPg();
  const customerId = await ensureWaqarTenancy();
  const tenancy = await getActiveTenancyForCustomer(customerId);
  console.log('\nActive tenancy:', tenancy);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
