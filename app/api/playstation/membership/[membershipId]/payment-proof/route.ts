import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { submitMembershipPaymentProof } from '@/src/services/playstationMembership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ membershipId: string }> },
) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const { membershipId } = await ctx.params;

  let body: { paymentProofUrl?: string | null; transactionRef?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.transactionRef?.trim()) {
    return NextResponse.json(
      { ok: false, message: 'Transaction ID is required.' },
      { status: 400 },
    );
  }

  try {
    await submitMembershipPaymentProof({
      membershipId,
      customerId: session.customerId,
      transactionRef: body.transactionRef,
      paymentProofUrl: body.paymentProofUrl ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
