import { db } from '@/src/db/client';
import { resolveEcosystemAdminPassword } from '@/src/lib/auth/ecosystemAdmin';
import { upsertPgEcosystemAdmin } from '@/src/lib/auth/upsertEcosystemAdminPg';

/**
 * Ensures the ecosystem standard admin exists on PG.
 * Updates legacy seed emails + password hash when ECOSYSTEM_ADMIN_PASSWORD is set.
 */
export async function bootstrapAdminIfNeeded(): Promise<'created' | 'updated' | 'skipped'> {
  if (!resolveEcosystemAdminPassword()) return 'skipped';

  const result = await upsertPgEcosystemAdmin(db);
  if (result.action === 'skipped') return 'skipped';

  if (result.action === 'created') {
    console.log(`✓ Bootstrapped PG admin ${result.email} from ECOSYSTEM_ADMIN_PASSWORD`);
  } else if (result.previousEmail !== result.email) {
    console.log(
      `✓ Updated PG admin ${result.previousEmail} → ${result.email} (password hash refreshed)`,
    );
  } else {
    console.log(`✓ Refreshed PG admin password hash for ${result.email}`);
  }

  return result.action === 'created' ? 'created' : 'updated';
}
