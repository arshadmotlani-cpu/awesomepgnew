import { NextResponse } from 'next/server';
import {
  findCustomerByEmail,
  findCustomerByPhone,
  isAccountComplete,
  upsertRecoveryCustomerProfile,
} from '@/src/lib/auth/customer';
import { resolveBookingOtpEmail } from '@/src/lib/auth/bookingOtp';
import { verifyEmailOtp } from '@/src/lib/auth/otp';
import { createCustomerSession } from '@/src/lib/auth/session';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { stampProfileCompletedAtIfReady } from '@/src/services/profile';

export async function POST(request: Request) {
  let body: { phone?: string; fullName?: string; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const phone = normaliseIndianPhone(body.phone ?? '');
  const fullName = (body.fullName ?? '').trim();
  const code = (body.code ?? '').trim();

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
  if (!code) {
    return NextResponse.json(
      { ok: false, message: 'Enter the verification code.' },
      { status: 400 },
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  const otpCtx = { ip, userAgent };

  try {
    const { email } = await resolveBookingOtpEmail(phone);
    const verified = await verifyEmailOtp(email, code, otpCtx, { consume: true });
    if (!verified.ok) {
      return NextResponse.json(verified, { status: 400 });
    }

    const existingByPhone = await findCustomerByPhone(phone);
    const existingByEmail = await findCustomerByEmail(email);

    let customerId: string;

    if (existingByPhone && isAccountComplete(existingByPhone)) {
      customerId = existingByPhone.id;
      if (existingByPhone.fullName.trim().length < 2) {
        await upsertRecoveryCustomerProfile({
          email: existingByPhone.email,
          fullName,
          phone,
        });
      }
    } else if (existingByEmail && isAccountComplete(existingByEmail)) {
      customerId = existingByEmail.id;
    } else {
      const row = await upsertRecoveryCustomerProfile({ email, fullName, phone });
      customerId = row.id;
    }

    await stampProfileCompletedAtIfReady(customerId);
    await createCustomerSession({ customerId, ip, userAgent });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'Could not verify your code. Please try again.';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
