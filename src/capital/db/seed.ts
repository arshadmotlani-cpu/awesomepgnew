import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createCapitalClient } from '@/src/capital/db/client';
import {
  acAdminUsers,
  acCategories,
  acSettings,
} from '@/src/capital/db/schema';
import { hashPassword } from '@/src/capital/lib/auth/crypto';

const EXPENSE_CATEGORIES = [
  { slug: 'purchase', label: 'Purchase', sortOrder: 1 },
  { slug: 'repair', label: 'Repair', sortOrder: 2 },
  { slug: 'painting', label: 'Painting', sortOrder: 3 },
  { slug: 'denting', label: 'Denting', sortOrder: 4 },
  { slug: 'engine', label: 'Engine', sortOrder: 5 },
  { slug: 'accessories', label: 'Accessories', sortOrder: 6 },
  { slug: 'fuel', label: 'Fuel', sortOrder: 7 },
  { slug: 'insurance', label: 'Insurance', sortOrder: 8 },
  { slug: 'broker', label: 'Broker', sortOrder: 9 },
  { slug: 'transport', label: 'Transport', sortOrder: 10 },
  { slug: 'cleaning', label: 'Cleaning', sortOrder: 11 },
  { slug: 'rto', label: 'RTO', sortOrder: 12 },
  { slug: 'miscellaneous', label: 'Miscellaneous', sortOrder: 13 },
  { slug: 'expense_adjustment', label: 'Expense Adjustment', sortOrder: 14 },
] as const;

async function main() {
  const { db, close } = createCapitalClient({ max: 1 });

  const [existingSettings] = await db.select().from(acSettings).limit(1);
  if (!existingSettings) {
    await db.insert(acSettings).values({ businessName: 'Automotive Capital' });
    console.log('✓ Settings seeded');
  }

  for (const cat of EXPENSE_CATEGORIES) {
    const [existing] = await db
      .select()
      .from(acCategories)
      .where(eq(acCategories.slug, cat.slug))
      .limit(1);
    if (!existing) {
      await db.insert(acCategories).values({
        slug: cat.slug,
        label: cat.label,
        kind: 'expense',
        isSystem: true,
        sortOrder: cat.sortOrder,
      });
    }
  }
  console.log('✓ Categories seeded');

  const email = process.env.INVEST_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INVEST_ADMIN_PASSWORD?.trim();
  if (!email || !password) {
    console.warn('⚠ INVEST_ADMIN_EMAIL / INVEST_ADMIN_PASSWORD not set — skipping admin seed');
  } else {
    const [existing] = await db.select().from(acAdminUsers).limit(1);
    if (!existing) {
      await db.insert(acAdminUsers).values({
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
  console.log('✓ Capital seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
