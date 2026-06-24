/**
 * Time-versioned bed_prices writes — shared by room editor and bulk PG pricing.
 */

import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedPrices } from '@/src/db/schema';
import { formatDate, parseDate, todayString } from '@/src/lib/dates';

export type BedPriceVersionInput = {
  bedId: string;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  dailySecurityDepositPaise: number;
  weeklySecurityDepositPaise: number;
  monthlySecurityDepositPaise: number;
  securityDepositPaise: number;
};

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function monthStartFor(dateIso: string): string {
  const d = parseDate(dateIso);
  return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/**
 * Close the active price row (if any) and insert a new effective window.
 * Does NOT touch bookings or invoices.
 */
export async function writeBedPriceVersion(
  input: BedPriceVersionInput,
  effectiveFrom: string,
  tx: DbTx = db as unknown as DbTx,
): Promise<void> {
  const priceValues = {
    dailyRatePaise: input.dailyRatePaise,
    weeklyRatePaise: input.weeklyRatePaise,
    monthlyRatePaise: input.monthlyRatePaise,
    securityDepositPaise: input.securityDepositPaise,
    dailySecurityDepositPaise: input.dailySecurityDepositPaise,
    weeklySecurityDepositPaise: input.weeklySecurityDepositPaise,
    monthlySecurityDepositPaise: input.monthlySecurityDepositPaise,
  };

  const today = todayString();
  const [active] = await tx
    .select()
    .from(bedPrices)
    .where(
      and(
        eq(bedPrices.bedId, input.bedId),
        sql`${bedPrices.effectiveFrom} <= ${today}::date`,
        or(isNull(bedPrices.effectiveTo), sql`${bedPrices.effectiveTo} > ${today}::date`),
      ),
    )
    .orderBy(desc(bedPrices.effectiveFrom))
    .limit(1);

  if (active) {
    if (active.effectiveFrom < effectiveFrom) {
      await tx
        .update(bedPrices)
        .set({ effectiveTo: effectiveFrom, updatedAt: new Date() })
        .where(eq(bedPrices.id, active.id));
      await tx.insert(bedPrices).values({
        bedId: input.bedId,
        ...priceValues,
        effectiveFrom,
      });
    } else {
      await tx
        .update(bedPrices)
        .set({
          ...priceValues,
          effectiveFrom,
          effectiveTo: null,
          updatedAt: new Date(),
        })
        .where(eq(bedPrices.id, active.id));
    }
  } else {
    await tx.insert(bedPrices).values({
      bedId: input.bedId,
      ...priceValues,
      effectiveFrom,
    });
  }
}

export { monthStartFor };
