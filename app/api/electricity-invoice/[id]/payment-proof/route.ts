import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { submitElectricityPaymentProof } from '@/src/services/meterElectricity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: { paymentProofUrl?: string; transactionRef?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.paymentProofUrl?.trim()) {
    return NextResponse.json(
      { ok: false, message: 'paymentProofUrl is required.' },
      { status: 400 },
    );
  }

  const result = await submitElectricityPaymentProof(
    session.customerId,
    id,
    body.paymentProofUrl,
    body.transactionRef,
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
