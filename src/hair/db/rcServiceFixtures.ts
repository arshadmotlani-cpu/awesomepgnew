import { and, eq } from 'drizzle-orm';
import type { createHairClient } from '@/src/hair/db/client';
import { fyhServiceStaff, fyhServices } from '@/src/hair/db/schema';
import { ensureRcCutConsumableKit } from '@/src/hair/db/rcConsumableKit';

type HairDb = ReturnType<typeof createHairClient>['db'];

/** Canonical RC integration fixtures — must stay bookable across seed/sync/test runs. */
export const RC_SERVICE_DEFS = [
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
] as const;

export type RcServiceCode = (typeof RC_SERVICE_DEFS)[number]['code'];

/**
 * Idempotent repair for RC-* services.
 *
 * Catalog sync and some integration tests can archive or rename these rows.
 * Bookings require `isActive=true`, so fixtures must self-heal before each suite.
 */
export async function ensureRcBookableServices(
  db: HairDb,
  opts?: {
    staffIds?: string[];
    productId?: string;
  },
): Promise<Record<RcServiceCode, string>> {
  const ids = {} as Record<RcServiceCode, string>;

  for (const svc of RC_SERVICE_DEFS) {
    const [existing] = await db
      .select()
      .from(fyhServices)
      .where(eq(fyhServices.code, svc.code))
      .limit(1);

    let serviceId: string;
    if (existing) {
      serviceId = existing.id;
      const needsRepair =
        !existing.isActive ||
        existing.name !== svc.name ||
        existing.archivedAt != null ||
        existing.durationMinutes !== svc.durationMinutes ||
        existing.pricePaise !== svc.pricePaise;

      if (needsRepair) {
        await db
          .update(fyhServices)
          .set({
            name: svc.name,
            category: 'Hair',
            durationMinutes: svc.durationMinutes,
            pricePaise: svc.pricePaise,
            gstBps: svc.gstBps,
            isActive: true,
            archivedAt: null,
            commissionType: 'none',
            updatedAt: new Date(),
          })
          .where(eq(fyhServices.id, existing.id));
      }
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

    ids[svc.code] = serviceId;

    for (const staffId of opts?.staffIds ?? []) {
      const [link] = await db
        .select({ serviceId: fyhServiceStaff.serviceId })
        .from(fyhServiceStaff)
        .where(and(eq(fyhServiceStaff.serviceId, serviceId), eq(fyhServiceStaff.staffId, staffId)))
        .limit(1);
      if (!link) {
        try {
          await db.insert(fyhServiceStaff).values({ serviceId, staffId });
        } catch {
          // Concurrent fixture setup may race on the same link.
        }
      }
    }

    if (svc.withConsumable && opts?.productId) {
      await ensureRcCutConsumableKit(db, serviceId, opts.productId, 10);
    }
  }

  return ids;
}

/** True when a service code is an RC integration fixture (must not be archived by catalog sync). */
export function isRcFixtureServiceCode(code: string | null | undefined): boolean {
  if (!code?.trim()) return false;
  return /^RC-/i.test(code.trim());
}
