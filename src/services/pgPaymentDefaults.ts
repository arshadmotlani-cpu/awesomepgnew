import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgPaymentCategories, pgs } from '@/src/db/schema';
import {
  DEFAULT_ELECTRICITY_DAILY_QR_PATH,
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  DEFAULT_RENT_DEPOSIT_QR_PATH,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
  ELECTRICITY_CATEGORY_NAME,
  LEGACY_ELECTRICITY_CATEGORY_NAME,
  RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
} from '@/src/lib/payments/defaultQr';

function findElectricityCategory(
  existing: Array<(typeof pgPaymentCategories.$inferSelect)>,
) {
  return existing.find(
    (c) =>
      c.name === ELECTRICITY_CATEGORY_NAME ||
      c.name === LEGACY_ELECTRICITY_CATEGORY_NAME ||
      /electricity/i.test(c.name),
  );
}

/** Ensure every PG has both standard UPI QR categories and payments enabled. */
export async function ensureDefaultPaymentCategoriesForPg(pgId: string): Promise<void> {
  await db
    .update(pgs)
    .set({ hasPaymentEnabled: true, updatedAt: new Date() })
    .where(eq(pgs.id, pgId));

  const existing = await db
    .select()
    .from(pgPaymentCategories)
    .where(eq(pgPaymentCategories.pgId, pgId));

  const rentCat = existing.find((c) => c.name === RENT_DEPOSIT_BOOKING_CATEGORY_NAME);
  if (rentCat) {
    if (!rentCat.isActive) {
      await db
        .update(pgPaymentCategories)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(pgPaymentCategories.id, rentCat.id));
    }
  } else {
    await db.insert(pgPaymentCategories).values({
      pgId,
      name: RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
      qrCodeImageUrl: DEFAULT_RENT_DEPOSIT_QR_PATH,
      upiId: DEFAULT_RENT_DEPOSIT_UPI_ID,
      isActive: true,
    });
  }

  const elecCat = findElectricityCategory(existing);
  if (elecCat) {
    const updates: {
      isActive: boolean;
      updatedAt: Date;
      name?: string;
    } = { isActive: true, updatedAt: new Date() };
    if (elecCat.name !== ELECTRICITY_CATEGORY_NAME) {
      updates.name = ELECTRICITY_CATEGORY_NAME;
    }
    if (!elecCat.isActive || updates.name) {
      await db
        .update(pgPaymentCategories)
        .set(updates)
        .where(eq(pgPaymentCategories.id, elecCat.id));
    }
  } else {
    await db.insert(pgPaymentCategories).values({
      pgId,
      name: ELECTRICITY_CATEGORY_NAME,
      qrCodeImageUrl: DEFAULT_ELECTRICITY_DAILY_QR_PATH,
      upiId: DEFAULT_ELECTRICITY_DAILY_UPI_ID,
      isActive: true,
    });
  }
}

export async function ensureDefaultPaymentCategoriesForAllPgs(): Promise<number> {
  const rows = await db
    .select({ id: pgs.id })
    .from(pgs)
    .where(isNull(pgs.archivedAt));
  for (const pg of rows) {
    await ensureDefaultPaymentCategoriesForPg(pg.id);
  }
  return rows.length;
}

export async function getRentDepositBookingCategory(pgId: string) {
  const [row] = await db
    .select()
    .from(pgPaymentCategories)
    .where(
      and(
        eq(pgPaymentCategories.pgId, pgId),
        eq(pgPaymentCategories.name, RENT_DEPOSIT_BOOKING_CATEGORY_NAME),
        eq(pgPaymentCategories.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getElectricityDailyCategory(pgId: string) {
  const rows = await db
    .select()
    .from(pgPaymentCategories)
    .where(
      and(eq(pgPaymentCategories.pgId, pgId), eq(pgPaymentCategories.isActive, true)),
    );

  return (
    rows.find((c) => c.name === ELECTRICITY_CATEGORY_NAME) ??
    rows.find((c) => c.name === LEGACY_ELECTRICITY_CATEGORY_NAME) ??
    rows.find((c) => /electricity/i.test(c.name)) ??
    null
  );
}
