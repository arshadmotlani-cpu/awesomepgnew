import { NextResponse } from 'next/server';
import { proofUrlToImageResponse } from '@/src/lib/payments/proofResponse';
import { getCustomerSession } from '@/src/lib/auth/session';
import { resolveCustomerPlaystationProofUrl } from '@/src/services/paymentProofServe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const url = await resolveCustomerPlaystationProofUrl(session.customerId, id);
  if (!url) {
    return new Response('Payment proof not found', { status: 404 });
  }

  return proofUrlToImageResponse(url);
}
