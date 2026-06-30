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
  'deposit_link',
]);

export async function GET(
  req: Request,
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

  const download = new URL(req.url).searchParams.get('download') === '1';
  const response = await proofUrlToImageResponse(url);
  if (download && response.ok) {
    const headers = new Headers(response.headers);
    headers.set('Content-Disposition', 'attachment; filename="payment-proof.jpg"');
    return new Response(response.body, { status: response.status, headers });
  }

  return response;
}
