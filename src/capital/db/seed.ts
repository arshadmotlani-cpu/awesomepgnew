import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createCapitalClient } from '@/src/capital/db/client';
import {
  acCategories,
  acSettings,
} from '@/src/capital/db/schema';
import { upsertCapitalEcosystemAdmin } from '@/src/capital/lib/auth/upsertEcosystemAdmin';

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

  const adminResult = await upsertCapitalEcosystemAdmin(db);
  if (adminResult.action === 'skipped') {
    console.warn(`⚠ Capital admin seed skipped (${adminResult.reason})`);
  } else if (adminResult.action === 'created') {
    console.log(`✓ Admin seeded: ${adminResult.email}`);
  } else if (adminResult.previousEmail !== adminResult.email) {
    console.log(`✓ Admin updated: ${adminResult.previousEmail} → ${adminResult.email}`);
  } else {
    console.log(`✓ Admin password refreshed: ${adminResult.email}`);
  }

  await close();
  console.log('✓ Capital seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
