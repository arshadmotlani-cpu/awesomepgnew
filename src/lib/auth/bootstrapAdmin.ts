import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema';
import { hashPassword } from '@/src/lib/auth/crypto';
import { SEED_ADMIN_EMAIL } from '@/src/lib/auth/adminPasswordReset';
import { env } from '@/src/lib/env';

/**
 * Creates the first admin account when `ADMIN_INITIAL_PASSWORD` is set and no
 * admin user exists yet. Safe to run on every deploy — never overwrites passwords.
 */
export async function bootstrapAdminIfNeeded(): Promise<'created' | 'skipped'> {
  const password = env.ADMIN_INITIAL_PASSWORD?.trim();
  if (!password) return 'skipped';

  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, SEED_ADMIN_EMAIL))
    .limit(1);

  if (existing) return 'skipped';

  await db.insert(adminUsers).values({
    fullName: 'Super Admin',
    email: SEED_ADMIN_EMAIL,
    passwordHash: hashPassword(password),
    role: 'super_admin',
    pgScope: [],
    isActive: true,
    mustChangePassword: false,
  });

  console.log(`✓ Bootstrapped admin user ${SEED_ADMIN_EMAIL} from ADMIN_INITIAL_PASSWORD`);
  return 'created';
}
