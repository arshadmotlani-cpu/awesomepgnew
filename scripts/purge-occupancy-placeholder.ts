/**
 * Remove internal occupancy placeholder customer and release blocked beds.
 *
 * Usage: npx tsx -r dotenv/config scripts/purge-occupancy-placeholder.ts
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { purgeOccupancyPlaceholderFromSystem } from '../src/services/occupancyAdmin';
import type { AdminSession } from '../src/lib/auth/session';

const bootstrapSession: AdminSession = {
  kind: 'admin',
  sessionId: 'script',
  adminId: null as unknown as string,
  email: 'script@awesomepg.internal',
  fullName: 'Purge occupancy placeholder',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function main() {
  const result = await purgeOccupancyPlaceholderFromSystem(bootstrapSession);
  console.log(
    JSON.stringify(
      {
        customerId: result.customerId,
        customerArchived: result.customerArchived,
        bedsReleased: result.bedsReleased,
        bookingsCancelled: result.bookingsCancelled,
      },
      null,
      2,
    ),
  );
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
