/* eslint-disable no-console */
/** Verify Express Booking context loads for Waqar without serialization errors. */
import 'dotenv/config';
import { ilike } from 'drizzle-orm';
import { closeDb, createClient, db } from '../src/db/client';
import { adminUsers, customers } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { loadExpressBookingResidentContext } from '../src/services/expressBookingContext';
import { serializeExpressBookingContext } from '../src/lib/admin/expressBookingTypes';
import type { AdminSession } from '../src/lib/auth/session';

async function main() {
  createClient({ max: 1 });
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, 'admin@awesomepg.local')).limit(1);
  const [waqar] = await db.select().from(customers).where(ilike(customers.fullName, '%Waqar%')).limit(1);
  if (!admin || !waqar) throw new Error('Missing admin or Waqar');

  const session: AdminSession = {
    kind: 'admin',
    sessionId: 'verify',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86400000),
  };

  const ctx = await loadExpressBookingResidentContext(session, waqar.id);
  const serialized = serializeExpressBookingContext(ctx!);
  const json = JSON.stringify(serialized);
  console.log('OK — context serializes', json.length, 'bytes');
  console.log('Active tenancy:', serialized.activeTenancy?.pgName, serialized.activeTenancy?.roomNumber, serialized.activeTenancy?.bedCode);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
