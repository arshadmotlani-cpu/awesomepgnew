import { NextResponse } from 'next/server';
import { proofUrlToImageResponse } from '@/src/lib/payments/proofResponse';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  resolveAdminPaymentProofUrl,
  type PaymentProofKind,
} from '@/src/services/paymentProofServe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set<PaymentProofKind>([
  'playstation',
  'rent',
  'electricity',
  'extension',
  'qr',
]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin sign-in required.' }, { status: 401 });
  }

  const { kind, id } = await ctx.params;
  if (!KINDS.has(kind as PaymentProofKind)) {
    return new Response('Unknown proof type', { status: 404 });
  }

  const url = await resolveAdminPaymentProofUrl(session, kind as PaymentProofKind, id);
  if (!url) {
    return new Response('Payment proof not found', { status: 404 });
  }

  return await proofUrlToImageResponse(url);
}
