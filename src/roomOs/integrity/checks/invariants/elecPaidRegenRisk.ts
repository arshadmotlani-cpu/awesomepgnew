/**
 * INV_ELEC_PAID_REGEN_RISK — paid electricity invoice blocks regeneration.
 */

import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityInvoices, floors, rooms } from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import type { InvariantFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';

export async function checkElectricityPaidRegenRisk(
  ctx: PreflightCheckContext,
): Promise<InvariantFinding[]> {
  if (!ctx.scope.roomId || !ctx.scope.billingMonth) return [];

  const billingMonth = firstOfMonth(ctx.scope.billingMonth);
  const bookingFilter = ctx.scope.bookingId
    ? eq(electricityInvoices.bookingId, ctx.scope.bookingId)
    : sql`TRUE`;

  const rows = await db
    .select({
      id: electricityInvoices.id,
      bookingId: electricityInvoices.bookingId,
      paidPaise: electricityInvoices.paidPaise,
    })
    .from(electricityInvoices)
    .innerJoin(rooms, eq(rooms.id, electricityInvoices.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(electricityInvoices.roomId, ctx.scope.roomId),
        eq(electricityInvoices.billingMonth, billingMonth),
        eq(floors.pgId, ctx.scope.pgId),
        gt(electricityInvoices.paidPaise, 0),
        sql`${electricityInvoices.status} <> 'cancelled'`,
        bookingFilter,
      ),
    );

  return rows.map((row) => ({
    kind: 'electricity_paid_skip' as const,
    severity: 'block' as const,
    reasonCode: 'INV_ELEC_PAID_REGEN_RISK',
    description: `Electricity invoice ${row.id} already has ${row.paidPaise} paise collected for this room-month.`,
    context: {
      invoiceId: row.id,
      bookingId: row.bookingId,
      roomId: ctx.scope.roomId,
      billingMonth,
      paidPaise: row.paidPaise,
    },
  }));
}
