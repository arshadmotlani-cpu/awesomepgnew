import { NextResponse } from 'next/server';
import { createCustomerProfile, findCustomerByEmail } from '@/src/lib/auth/customer';
import { verifyEmailOtp } from '@/src/lib/auth/otp';
import { profileRedirectWithNext } from '@/src/lib/auth/safeNext';
import { createCustomerSession } from '@/src/lib/auth/session';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { isProfileComplete } from '@/src/services/profile';

export async function POST(request: Request) {
  let body: {
    email?: string;
    code?: string;
    fullName?: string;
    phone?: string;
    next?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  const otpCtx = { ip, userAgent };

  const existingCustomer = await findCustomerByEmail(body.email ?? '');
  const isSignupProfileStep = Boolean(
    !existingCustomer &&
      (body.fullName ?? '').trim() &&
      (body.phone ?? '').trim(),
  );

  const verified = await verifyEmailOtp(
    body.email ?? '',
    body.code ?? '',
    otpCtx,
    { consume: existingCustomer ? true : isSignupProfileStep },
  );
  if (!verified.ok) {
    return NextResponse.json(verified, { status: 400 });
  }

  let customer = existingCustomer;
  if (!customer) {
    const fullName = (body.fullName ?? '').trim();
    const phone = normaliseIndianPhone(body.phone ?? '');
    if (!fullName || fullName.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          needsProfile: true,
          email: verified.email,
          message: 'Complete your profile to continue.',
        },
        { status: 400 },
      );
    }
    if (!phone) {
      return NextResponse.json(
        {
          ok: false,
          needsProfile: true,
          email: verified.email,
          message: 'Enter a valid 10-digit mobile number.',
        },
        { status: 400 },
      );
    }
    customer = await createCustomerProfile({
      email: verified.email,
      fullName,
      phone,
    });
  } else if (!isProfileComplete(customer)) {
    await createCustomerSession({
      customerId: customer.id,
      ip,
      userAgent,
    });
    return NextResponse.json(
      {
        ok: false,
        needsProfileComplete: true,
        email: verified.email,
        message: 'Complete your resident profile to continue.',
        redirect: profileRedirectWithNext(body.next),
      },
      { status: 400 },
    );
  }

  await createCustomerSession({
    customerId: customer.id,
    ip,
    userAgent,
  });

  return NextResponse.json({
    ok: true,
    customerId: customer.id,
    email: customer.email,
    phone: customer.phone,
    fullName: customer.fullName,
    mustSetPassword: !customer.passwordHash || customer.mustSetPassword,
  });
}
