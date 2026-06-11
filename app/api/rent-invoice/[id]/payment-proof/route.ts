import { NextResponse } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { submitRentPaymentProof } from '@/src/services/rentInvoices';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: { paymentProofUrl?: string };
  try {
    body = (await req.json()) as { paymentProofUrl?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }

  if (!body.paymentProofUrl?.trim()) {
    return NextResponse.json(
      { ok: false, message: 'paymentProofUrl is required.' },
      { status: 400 },
    );
  }

  const result = await submitRentPaymentProof(
    session.customerId,
    id,
    body.paymentProofUrl,
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
