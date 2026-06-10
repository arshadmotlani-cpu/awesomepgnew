import { NextResponse } from 'next/server';
import { sendEmailOtp } from '@/src/lib/auth/otp';

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  const result = await sendEmailOtp(body.email ?? '', { ip, userAgent });
  if (!result.ok) {
    return NextResponse.json(result, {
      status: result.retryAfterSeconds ? 429 : 400,
    });
  }

  return NextResponse.json({
    ok: true,
    email: result.email,
    expiresAt: result.expiresAt.toISOString(),
    resendAfter: result.resendAfter,
    delivery: result.delivery,
  });
}
