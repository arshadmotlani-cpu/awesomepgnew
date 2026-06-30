import { NextResponse } from 'next/server';
import { proofUrlToImageResponse } from '@/src/lib/payments/proofResponse';
import {
  checkoutSettlementStoredUrlForKind,
  type CheckoutSettlementImageKind,
} from '@/src/lib/checkout/checkoutSettlementImages';
import { getAdminSession } from '@/src/lib/auth/session';
import { getCheckoutSettlementStoredImageUrl } from '@/src/services/checkoutSettlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set<CheckoutSettlementImageKind>(['meter', 'refund_qr']);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; kind: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin sign-in required.' }, { status: 401 });
  }

  const { id, kind } = await ctx.params;
  if (!KINDS.has(kind as CheckoutSettlementImageKind)) {
    return new Response('Unknown image type', { status: 404 });
  }

  const settlement = await getCheckoutSettlementStoredImageUrl(session, id);
  if (!settlement) {
    return new Response('Checkout settlement not found', { status: 404 });
  }

  const storedUrl = checkoutSettlementStoredUrlForKind(
    settlement,
    kind as CheckoutSettlementImageKind,
  );
  if (!storedUrl) {
    return new Response('Image not uploaded', { status: 404 });
  }

  return proofUrlToImageResponse(storedUrl);
}
