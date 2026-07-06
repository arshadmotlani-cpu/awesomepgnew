import { NextRequest } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { quoteBedReserve } from '@/src/services/bedReserve';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ bedId: string }> },
) {
  const { bedId } = await ctx.params;
  const start = req.nextUrl.searchParams.get('start');
  const checkIn = req.nextUrl.searchParams.get('checkIn');
  if (!start || !checkIn) {
    return Response.json(
      { ok: false, error: { message: 'start and checkIn query params required.' } },
      { status: 400 },
    );
  }
  try {
    const session = await getCustomerSession();
    const data = await quoteBedReserve({
      bedId,
      reserveStart: start,
      checkInDate: checkIn,
      customerId: session?.customerId,
    });
    return Response.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quote failed.';
    return Response.json({ ok: false, error: { message } }, { status: 400 });
  }
}
