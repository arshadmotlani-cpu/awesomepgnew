import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgPaymentCategories, pgs } from '@/src/db/schema';
import {
  DEFAULT_RENT_DEPOSIT_QR_PATH,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
  ELECTRICITY_CATEGORY_NAME,
  RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
} from '@/src/lib/payments/defaultQr';

const PLACEHOLDER_ELECTRICITY_QR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect fill="#111" width="100%" height="100%"/><text x="50%" y="50%" fill="#888" font-size="14" text-anchor="middle" dominant-baseline="middle">Electricity QR coming soon</text></svg>',
  );

/** Ensure every PG has the standard rent/deposit/booking QR and payments enabled. */
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
    await db
      .update(pgPaymentCategories)
      .set({
        qrCodeImageUrl: DEFAULT_RENT_DEPOSIT_QR_PATH,
        upiId: DEFAULT_RENT_DEPOSIT_UPI_ID,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(pgPaymentCategories.id, rentCat.id));
  } else {
    await db.insert(pgPaymentCategories).values({
      pgId,
      name: RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
      qrCodeImageUrl: DEFAULT_RENT_DEPOSIT_QR_PATH,
      upiId: DEFAULT_RENT_DEPOSIT_UPI_ID,
      isActive: true,
    });
  }

  const elecCat = existing.find((c) => c.name === ELECTRICITY_CATEGORY_NAME);
  if (!elecCat) {
    await db.insert(pgPaymentCategories).values({
      pgId,
      name: ELECTRICITY_CATEGORY_NAME,
      qrCodeImageUrl: PLACEHOLDER_ELECTRICITY_QR,
      upiId: null,
      isActive: false,
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
