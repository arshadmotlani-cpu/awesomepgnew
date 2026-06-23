import { NextResponse } from 'next/server';
import { resolveBookingOtpEmail } from '@/src/lib/auth/bookingOtp';
import { sendEmailOtp } from '@/src/lib/auth/otp';
import { normaliseIndianPhone } from '@/src/lib/phone';

export async function POST(request: Request) {
  let body: { phone?: string; fullName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const phone = normaliseIndianPhone(body.phone ?? '');
  const fullName = (body.fullName ?? '').trim();
  if (!phone) {
    return NextResponse.json(
      { ok: false, message: 'Enter a valid 10-digit mobile number.' },
      { status: 400 },
    );
  }
  if (fullName.length < 2) {
    return NextResponse.json(
      { ok: false, message: 'Enter your full name.' },
      { status: 400 },
    );
  }

  try {
    const { email, existingAccount, maskedEmail } = await resolveBookingOtpEmail(phone);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers.get('user-agent');
    const result = await sendEmailOtp(email, { ip, userAgent });
    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.retryAfterSeconds ? 429 : 400,
      });
    }

    const otpHint = existingAccount
      ? `Code sent to ${maskedEmail ?? 'your registered email'}.`
      : 'Code sent to your mobile inbox (SMS coming soon — check email linked to this number).';

    return NextResponse.json({
      ok: true,
      otpHint,
      resendAfter: result.resendAfter,
      delivery: result.delivery,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send verification code.';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
