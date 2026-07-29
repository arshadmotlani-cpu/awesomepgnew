import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import {
  fyhAdminUsers,
  fyhMembershipPlans,
  fyhPackagePlans,
  fyhProducts,
  fyhResources,
  fyhServiceConsumables,
  fyhServices,
  fyhServiceStaff,
  fyhSettings,
  fyhStaff,
  fyhStaffSchedules,
} from '@/src/hair/db/schema';
import { hashPassword } from '@/src/hair/lib/auth/crypto';
import { DEFAULT_HOURS } from '@/src/hair/services/settings';
import { and } from 'drizzle-orm';

/**
 * Idempotent salon fixtures for local RC / demo.
 * Safe to re-run — skips rows that already exist by stable name/code.
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
    }
  }

  let productId: string;
  {
    const [existing] = await db
      .select()
      .from(fyhProducts)
      .where(eq(fyhProducts.sku, 'RC-SHAMPOO'))
      .limit(1);
    if (existing) {
      productId = existing.id;
      await db
        .update(fyhProducts)
        .set({ stockQty: Math.max(Number(existing.stockQty), 100), updatedAt: new Date() })
        .where(eq(fyhProducts.id, existing.id));
    } else {
      const [row] = await db
        .insert(fyhProducts)
        .values({
          name: 'RC Salon Shampoo',
          sku: 'RC-SHAMPOO',
          sellingPricePaise: 45000,
          costPricePaise: 20000,
          stockQty: 100,
          openingStock: 100,
          minStock: 10,
          reorderLevel: 15,
          unit: 'ml',
          gstBps: 1800,
          isConsumable: true,
          isRetail: true,
          isActive: true,
        })
        .returning();
      productId = row!.id;
    }
  }

  const serviceDefs = [
    {
      name: 'RC Haircut',
      code: 'RC-CUT',
      durationMinutes: 45,
      pricePaise: 80000,
      gstBps: 1800,
      withConsumable: true,
    },
    {
      name: 'RC Blow Dry',
      code: 'RC-BLOW',
      durationMinutes: 30,
      pricePaise: 50000,
      gstBps: 1800,
      withConsumable: false,
    },
  ];

  const serviceIds: string[] = [];
  for (const svc of serviceDefs) {
    const [existing] = await db.select().from(fyhServices).where(eq(fyhServices.code, svc.code)).limit(1);
    let serviceId: string;
    if (existing) {
      serviceId = existing.id;
    } else {
      const [row] = await db
        .insert(fyhServices)
        .values({
          name: svc.name,
          code: svc.code,
          category: 'Hair',
          durationMinutes: svc.durationMinutes,
          pricePaise: svc.pricePaise,
          gstBps: svc.gstBps,
          isActive: true,
          commissionType: 'none',
        })
        .returning();
      serviceId = row!.id;
    }
    serviceIds.push(serviceId);

    for (const staffId of staffIds) {
      const [link] = await db
        .select()
        .from(fyhServiceStaff)
        .where(and(eq(fyhServiceStaff.serviceId, serviceId), eq(fyhServiceStaff.staffId, staffId)))
        .limit(1);
      if (!link) {
        await db.insert(fyhServiceStaff).values({ serviceId, staffId });
      }
    }

    if (svc.withConsumable) {
      const [kit] = await db
        .select()
        .from(fyhServiceConsumables)
        .where(eq(fyhServiceConsumables.serviceId, serviceId))
        .limit(1);
      if (!kit) {
        await db.insert(fyhServiceConsumables).values({
          serviceId,
          productId,
          quantity: 10,
          deductInventory: true,
        });
      } else {
        await db
          .update(fyhServiceConsumables)
          .set({
            productId,
            quantity: kit.quantity ?? 10,
            deductInventory: true,
          })
          .where(eq(fyhServiceConsumables.id, kit.id));
      }
    }
  }

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
      serviceId: serviceIds[0]!,
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

  const email =
    process.env.HAIR_ADMIN_EMAIL?.trim().toLowerCase() || 'admin@fyhair.local';
  const password = process.env.HAIR_ADMIN_PASSWORD?.trim() || 'rc-local-change-me';
  const [existingAdmin] = await db.select().from(fyhAdminUsers).limit(1);
  if (!existingAdmin) {
    await db.insert(fyhAdminUsers).values({
      email,
      passwordHash: hashPassword(password),
      displayName: 'Administrator',
      role: 'super_admin',
    });
    console.log(`✓ Admin seeded: ${email}`);
  } else {
    console.log('✓ Admin already exists');
  }

  await seedRcFixtures(db);

  await close();
  console.log('✓ For Your Hair seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
