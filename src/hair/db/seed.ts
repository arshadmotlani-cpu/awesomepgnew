import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { ensureRcCutConsumableKit } from '@/src/hair/db/rcConsumableKit';
import { ensureRcBookableServices } from '@/src/hair/db/rcServiceFixtures';
import {
  fyhMembershipPlans,
  fyhPackagePlans,
  fyhProducts,
  fyhResources,
  fyhSettings,
  fyhStaff,
  fyhStaffSchedules,
} from '@/src/hair/db/schema';
import { upsertHairEcosystemAdmin } from '@/src/hair/lib/auth/upsertEcosystemAdmin';
import { DEFAULT_HOURS } from '@/src/hair/services/settings';

/**
 * Idempotent salon fixtures for local RC / demo.
 * Safe to re-run — restores RC services if catalog sync archived them.
 */
async function seedRcFixtures(
  db: ReturnType<typeof createHairClient>['db'],
) {
  await db
    .update(fyhSettings)
    .set({
      businessName: 'For Your Hair',
      timezone: 'Asia/Kolkata',
      businessHours: DEFAULT_HOURS.map((h) =>
        h.dayOfWeek === 0 ? { ...h, closed: false, open: '10:00', close: '20:00' } : h,
      ),
      invoicePrefix: 'FYH',
      defaultGstBps: 1800,
      defaultBufferMinutes: 5,
      updatedAt: new Date(),
    })
    .where(eq(fyhSettings.id, (await db.select({ id: fyhSettings.id }).from(fyhSettings).limit(1))[0]!.id));

  const staffDefs = [
    {
      fullName: 'RC Stylist Asha',
      role: 'Senior Stylist',
      defaultCommissionType: 'percentage' as const,
      defaultCommissionPercentBps: 1000,
    },
    {
      fullName: 'RC Stylist Rohan',
      role: 'Stylist',
      defaultCommissionType: 'fixed' as const,
      defaultCommissionFixedPaise: 5000,
    },
  ];

  const staffIds: string[] = [];
  for (const s of staffDefs) {
    const [existing] = await db
      .select()
      .from(fyhStaff)
      .where(eq(fyhStaff.fullName, s.fullName))
      .limit(1);
    if (existing) {
      staffIds.push(existing.id);
      if (!existing.isActive) {
        await db
          .update(fyhStaff)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(fyhStaff.id, existing.id));
      }
      continue;
    }
    const [row] = await db
      .insert(fyhStaff)
      .values({
        fullName: s.fullName,
        role: s.role,
        defaultCommissionType: s.defaultCommissionType,
        defaultCommissionPercentBps: s.defaultCommissionPercentBps ?? 0,
        defaultCommissionFixedPaise: s.defaultCommissionFixedPaise ?? 0,
        isActive: true,
      })
      .returning();
    staffIds.push(row!.id);
    for (let day = 1; day <= 6; day++) {
      await db.insert(fyhStaffSchedules).values({
        staffId: row!.id,
        dayOfWeek: day,
        startTime: '10:00',
        endTime: '20:00',
        lunchStart: '13:00',
        lunchEnd: '13:30',
      });
    }
  }

  for (const [i, name] of ['RC Chair 1', 'RC Chair 2'].entries()) {
    const [existing] = await db.select().from(fyhResources).where(eq(fyhResources.name, name)).limit(1);
    if (!existing) {
      await db.insert(fyhResources).values({
        name,
        type: 'chair',
        sortOrder: i + 1,
        isActive: true,
      });
    } else if (!existing.isActive) {
      await db
        .update(fyhResources)
        .set({ isActive: true })
        .where(eq(fyhResources.id, existing.id));
    }
  }

  let productId: string;
  {
    const [existing] = await db
      .select()
      .from(fyhProducts)
      .where(eq(fyhProducts.name, 'RC Salon Shampoo'))
      .limit(1);
    if (existing) {
      productId = existing.id;
      await db
        .update(fyhProducts)
        .set({
          stockQty: Math.max(Number(existing.stockQty), 100),
          productType: 'professional',
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(fyhProducts.id, existing.id));
    } else {
      const [row] = await db
        .insert(fyhProducts)
        .values({
          name: 'RC Salon Shampoo',
          productType: 'professional',
          sellingPricePaise: 0,
          costPricePaise: 20000,
          stockQty: 100,
          openingStock: 100,
          minStock: 10,
          isActive: true,
        })
        .returning();
      productId = row!.id;
    }
  }

  const serviceIds = await ensureRcBookableServices(db, { staffIds, productId });
  await ensureRcCutConsumableKit(db, serviceIds['RC-CUT'], productId, 10);

  const [mem] = await db.select().from(fyhMembershipPlans).limit(1);
  if (!mem) {
    await db.insert(fyhMembershipPlans).values({
      name: 'RC Gold',
      tier: 'gold',
      discountBps: 1000,
      pricePaise: 499900,
      validityDays: 365,
      isActive: true,
    });
  }

  const [pkg] = await db
    .select()
    .from(fyhPackagePlans)
    .where(eq(fyhPackagePlans.name, 'RC Cut Pack 5'))
    .limit(1);
  if (!pkg) {
    await db.insert(fyhPackagePlans).values({
      name: 'RC Cut Pack 5',
      serviceId: serviceIds['RC-CUT'],
      totalSessions: 5,
      pricePaise: 350000,
      validityDays: 180,
      isActive: true,
    });
  }

  console.log('✓ RC fixtures ready (staff, chairs, services, product, membership, package)');
}

async function main() {
  const { db, close } = createHairClient({ max: 1 });

  const [existingSettings] = await db.select().from(fyhSettings).limit(1);
  if (!existingSettings) {
    await db.insert(fyhSettings).values({
      businessName: 'For Your Hair',
      businessHours: DEFAULT_HOURS,
      timezone: 'Asia/Kolkata',
    });
    console.log('✓ Settings seeded');
  } else {
    console.log('✓ Settings already exist');
  }

  const result = await upsertHairEcosystemAdmin(db);
  if (result.action === 'skipped') {
    console.log(`↷ Admin seed skipped (${result.reason})`);
  } else if (result.action === 'created') {
    console.log(`✓ Admin seeded: ${result.email}`);
  } else if (result.previousEmail !== result.email) {
    console.log(`✓ Admin updated: ${result.previousEmail} → ${result.email}`);
  } else {
    console.log(`✓ Admin password refreshed: ${result.email}`);
  }

  if (process.env.HAIR_SEED_RC === '1') {
    await seedRcFixtures(db);
  } else {
    console.log('↷ Skipping RC fixtures (set HAIR_SEED_RC=1 to seed)');
  }

  await close();
  console.log('✓ For Your Hair seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
