import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createOwnerClient } from '@/src/owner/db/client';
import { upsertOwnerEcosystemAdmin } from '@/src/owner/lib/auth/upsertEcosystemAdmin';

async function main() {
  const { db, close } = createOwnerClient({ max: 1 });
  try {
    const result = await upsertOwnerEcosystemAdmin(db);
    if (result.action === 'skipped') {
      console.log(`Owner OS admin seed skipped (${result.reason})`);
      return;
    }
    if (result.action === 'created') {
      console.log(`✓ Seeded Owner OS admin ${result.email}`);
    } else if (result.previousEmail !== result.email) {
      console.log(`✓ Updated Owner OS admin ${result.previousEmail} → ${result.email}`);
    } else {
      console.log(`✓ Refreshed Owner OS admin password for ${result.email}`);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
