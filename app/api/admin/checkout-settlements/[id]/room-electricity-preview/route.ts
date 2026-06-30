import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { checkoutSettlements, vacatingRequests } from '@/src/db/schema';
import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { calculateCheckoutElectricity } from '@/src/lib/checkout/electricitySettlementCalc';
import { bookingRoomId } from '@/src/lib/checkout/electricitySettlement';
import { buildRoomElectricityCheckoutAllocation } from '@/src/services/roomElectricityCheckout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session || !adminHasPermission(session.role, 'deposits:write')) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: settlementId } = await ctx.params;
  const previousReading = Number(req.nextUrl.searchParams.get('previousReading'));
  const currentReading = Number(req.nextUrl.searchParams.get('currentReading'));
  const ratePerUnitInr = Number(req.nextUrl.searchParams.get('ratePerUnitInr'));

  if (
    !Number.isFinite(previousReading) ||
    !Number.isFinite(currentReading) ||
    !Number.isFinite(ratePerUnitInr)
  ) {
    return Response.json({ ok: false, error: 'Invalid meter inputs' }, { status: 400 });
  }

  const [row] = await db
    .select({
      customerId: checkoutSettlements.customerId,
      bookingId: checkoutSettlements.bookingId,
      vacatingDate: vacatingRequests.vacatingDate,
    })
    .from(checkoutSettlements)
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
    .where(eq(checkoutSettlements.id, settlementId))
    .limit(1);

  if (!row) {
    return Response.json({ ok: false, error: 'Settlement not found' }, { status: 404 });
  }

  const roomId = await bookingRoomId(row.bookingId);
  if (!roomId) {
    return Response.json({ ok: false, error: 'Room not found' }, { status: 404 });
  }

  const bill = calculateCheckoutElectricity({
    previousReading,
    currentReading,
    ratePerUnitPaise: Math.round(ratePerUnitInr * 100),
    roomOccupants: 1,
  });
  if (!bill.ok) {
    return Response.json({ ok: false, error: bill.error }, { status: 400 });
  }

  const allocation = await buildRoomElectricityCheckoutAllocation({
    roomId,
    customerId: row.customerId,
    vacatingDate: String(row.vacatingDate),
    totalBillPaise: bill.calc.totalBillPaise,
    unitsConsumed: bill.calc.unitsConsumed,
    excludeCheckoutSettlementId: settlementId,
  });

  return Response.json({ ok: true, data: allocation });
}
