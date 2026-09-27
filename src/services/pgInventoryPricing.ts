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

function normalizeEffectiveDate(iso: string): string {
  return formatDate(parseDate(iso.slice(0, 10)));
}

/**
 * Close the active price row (if any) and insert a new effective window.
 * Does NOT touch bookings or invoices.
 *
 * Versioning rules:
 * - effectiveFrom in the future: close current at effectiveFrom, insert new row (historical rows unchanged).
 * - effectiveFrom === active.effectiveFrom: update rates on that row only (same window start).
 * - effectiveFrom < active.effectiveFrom: rejected (no backdating).
 */
export async function writeBedPriceVersionInTx(
  tx: DbTx,
  input: BedPriceVersionInput,
  effectiveFrom: string,
): Promise<void> {
  const effectiveFromDate = normalizeEffectiveDate(effectiveFrom);
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

  if (!active) {
    await tx.insert(bedPrices).values({
      bedId: input.bedId,
      ...priceValues,
      effectiveFrom: effectiveFromDate,
    });
    return;
  }

  const activeFrom = normalizeEffectiveDate(String(active.effectiveFrom));

  if (effectiveFromDate < activeFrom) {
    throw new Error(
      `Cannot backdate bed pricing to ${effectiveFromDate} — active window starts ${activeFrom}.`,
    );
  }

  if (effectiveFromDate === activeFrom) {
    await tx
      .update(bedPrices)
      .set({
        ...priceValues,
        effectiveTo: active.effectiveTo,
        updatedAt: new Date(),
      })
      .where(eq(bedPrices.id, active.id));
    return;
  }

  // Mid-window change: close historical row at new effective date, insert successor (immutable past rates).
  await tx
    .update(bedPrices)
    .set({
      effectiveTo: effectiveFromDate,
      updatedAt: new Date(),
    })
    .where(eq(bedPrices.id, active.id));

  await tx.insert(bedPrices).values({
    bedId: input.bedId,
    ...priceValues,
    effectiveFrom: effectiveFromDate,
  });
}

export async function writeBedPriceVersion(
  input: BedPriceVersionInput,
  effectiveFrom: string,
  tx?: DbTx,
): Promise<void> {
  if (tx) {
    await writeBedPriceVersionInTx(tx, input, effectiveFrom);
    return;
  }
  await db.transaction(async (innerTx) => {
    await writeBedPriceVersionInTx(innerTx, input, effectiveFrom);
  });
}

export { monthStartFor };
