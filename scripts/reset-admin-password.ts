/* eslint-disable no-console */
/**
 * Reset admin@awesomepg.local password using ADMIN_INITIAL_PASSWORD from env.
 * Same effect as POST /api/cron/bootstrap-admin against production.
 *
 *   ADMIN_INITIAL_PASSWORD='your-secret' npx tsx scripts/reset-admin-password.ts
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createClient, closeDb } from '../src/db/client';
import { adminUsers } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth/crypto';

const SEED_ADMIN_EMAIL = 'admin@awesomepg.local';

async function main() {
  const password = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  if (!password) {
    console.error('Set ADMIN_INITIAL_PASSWORD in the environment first.');
    process.exit(1);
  }

  const { db } = createClient({ max: 1 });
  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, SEED_ADMIN_EMAIL))
    .limit(1);

  const passwordHash = hashPassword(password);

  if (existing) {
    await db
      .update(adminUsers)
      .set({
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.email, SEED_ADMIN_EMAIL));
    console.log(`✓ Reset password for ${SEED_ADMIN_EMAIL}`);
  } else {
    await db.insert(adminUsers).values({
      fullName: 'Super Admin',
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      role: 'super_admin',
      pgScope: [],
      isActive: true,
      mustChangePassword: false,
    });
    console.log(`✓ Created ${SEED_ADMIN_EMAIL}`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
