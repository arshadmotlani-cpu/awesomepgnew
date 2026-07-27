import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { createHairClient } from '@/src/hair/db/client';
import { fyhAdminUsers, fyhSettings } from '@/src/hair/db/schema';
import { hashPassword } from '@/src/hair/lib/auth/crypto';

async function main() {
  const { db, close } = createHairClient({ max: 1 });

  const [existingSettings] = await db.select().from(fyhSettings).limit(1);
  if (!existingSettings) {
    await db.insert(fyhSettings).values({ businessName: 'For Your Hair' });
    console.log('✓ Settings seeded');
  } else {
    console.log('✓ Settings already exist');
  }

  const email = process.env.HAIR_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.HAIR_ADMIN_PASSWORD?.trim();
  if (!email || !password) {
    console.warn('⚠ HAIR_ADMIN_EMAIL / HAIR_ADMIN_PASSWORD not set — skipping admin seed');
  } else {
    const [existing] = await db.select().from(fyhAdminUsers).limit(1);
    if (!existing) {
      await db.insert(fyhAdminUsers).values({
        email,
        passwordHash: hashPassword(password),
        displayName: 'Administrator',
      });
      console.log(`✓ Admin seeded: ${email}`);
    } else {
      console.log('✓ Admin already exists');
    }
  }

  await close();
  console.log('✓ For Your Hair seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
