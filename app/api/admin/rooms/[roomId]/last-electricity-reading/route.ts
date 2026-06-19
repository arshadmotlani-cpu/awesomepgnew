import { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, meterLogs } from '@/src/db/schema';
import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { estimateRoomAverageBillPaise } from '@/src/services/meterElectricity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const session = await getAdminSession();
  if (!session || !adminHasPermission(session.role, 'electricity:write')) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { roomId } = await ctx.params;

  const [lastBill] = await db
    .select({
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      billingMonth: electricityBills.billingMonth,
    })
    .from(electricityBills)
    .where(eq(electricityBills.roomId, roomId))
    .orderBy(desc(electricityBills.billingMonth))
    .limit(1);

  const [lastMeter] = await db
    .select({ units: meterLogs.units })
    .from(meterLogs)
    .where(eq(meterLogs.roomId, roomId))
    .orderBy(desc(meterLogs.createdAt))
    .limit(1);

  const previousReadingUnits =
    lastBill?.currentReadingUnits != null
      ? Number(lastBill.currentReadingUnits)
      : lastMeter?.units != null
        ? Number(lastMeter.units)
        : 0;

  const ratePaise = lastBill?.ratePerUnitPaise ?? DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;
  const estimatedAverageBillPaise = await estimateRoomAverageBillPaise(roomId, ratePaise);

  return Response.json({
    ok: true,
    data: {
      previousReadingUnits,
      ratePerUnitPaise: ratePaise,
      estimatedAverageBillPaise,
      lastBillingMonth: lastBill?.billingMonth ?? null,
    },
  });
}
