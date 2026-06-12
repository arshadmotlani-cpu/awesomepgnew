import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getCustomerSession } from '@/src/lib/auth/session';
import { recordBedNoticeInterest } from '@/src/services/bedNoticeInterest';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ bedId: string }> },
) {
  const { bedId } = await ctx.params;
  if (!bedId) {
    return NextResponse.json({ ok: false, message: 'Missing bed id.' }, { status: 400 });
  }

  const session = await getCustomerSession();
  const h = await headers();

  const result = await recordBedNoticeInterest({
    bedId,
    customerId: session?.customerId ?? null,
    ip: h.get('x-forwarded-for') ?? h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
