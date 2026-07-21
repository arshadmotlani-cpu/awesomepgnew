import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { estimateRoomAverageBillPaise } from '@/src/services/meterElectricity';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session || !adminHasPermission(session.role, 'electricity:write')) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: roomId } = await ctx.params;
  const baseline = await resolveRoomPreviousMeterReading(roomId);
  const estimatedAverageBillPaise = await estimateRoomAverageBillPaise(
    roomId,
    baseline.ratePerUnitPaise,
  );

  return Response.json({
    ok: true,
    data: {
      previousReadingUnits: baseline.previousReadingUnits,
      ratePerUnitPaise: baseline.ratePerUnitPaise,
      estimatedAverageBillPaise,
      lastBillingMonth: baseline.lastBillingMonth,
      previousReadingSource: baseline.source,
      lastBillMeterImageUrl: baseline.lastBillMeterImageUrl,
    },
  });
}
