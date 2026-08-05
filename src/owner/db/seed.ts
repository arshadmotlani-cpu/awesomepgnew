import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createOwnerClient } from '@/src/owner/db/client';
import { ooAdminUsers } from '@/src/owner/db/schema';
import { hashPassword } from '@/src/owner/lib/auth/crypto';

async function main() {
  const email = (process.env.OWNER_ADMIN_EMAIL ?? 'owner@awesomepg.in').trim().toLowerCase();
  const password = process.env.OWNER_ADMIN_PASSWORD ?? '';
  if (!password || password.length < 8) {
    console.log('OWNER_ADMIN_PASSWORD not set (≥8 chars) — skipping Owner OS admin seed.');
    return;
  }

  const { db, close } = createOwnerClient({ max: 1 });
  try {
    const [existing] = await db
      .select({ id: ooAdminUsers.id })
      .from(ooAdminUsers)
      .where(eq(ooAdminUsers.email, email))
      .limit(1);

    if (existing) {
      console.log(`Owner OS admin already exists: ${email}`);
      return;
    }

    await db.insert(ooAdminUsers).values({
      email,
      passwordHash: hashPassword(password),
      displayName: 'Owner',
    });
    console.log(`✓ Seeded Owner OS admin ${email}`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
