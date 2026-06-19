import { NextResponse } from 'next/server';
import { createCustomerProfile, findCustomerByEmail } from '@/src/lib/auth/customer';
import {
  consumeEmailOtpChallengeById,
  getActiveEmailOtpChallenge,
  verifyEmailOtp,
} from '@/src/lib/auth/otp';
import { profileRedirectWithNext } from '@/src/lib/auth/safeNext';
import {
  clearSignupVerificationCookie,
  issueSignupVerificationCookie,
  readSignupVerificationCookie,
  SIGNUP_SETUP_EXPIRED_MESSAGE,
} from '@/src/lib/auth/signupVerification';
import { createCustomerSession } from '@/src/lib/auth/session';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { isProfileComplete } from '@/src/services/profile';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

async function finishNewSignupSession(args: {
  customer: NonNullable<Awaited<ReturnType<typeof findCustomerByEmail>>>;
  ip: string | null;
  userAgent: string | null;
}) {
  await createCustomerSession({
    customerId: args.customer.id,
    ip: args.ip,
    userAgent: args.userAgent,
  });
  await clearSignupVerificationCookie();
  return NextResponse.json({
    ok: true,
    customerId: args.customer.id,
    email: args.customer.email,
    phone: args.customer.phone,
    fullName: args.customer.fullName,
    mustSetPassword: !args.customer.passwordHash || args.customer.mustSetPassword,
    alreadyComplete: true,
  });
}

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

  const email = normaliseEmail(body.email ?? '');
  if (!email) {
    return NextResponse.json({ ok: false, message: 'Invalid email address.' }, { status: 400 });
  }

  const existingCustomer = await findCustomerByEmail(email);
  const fullName = (body.fullName ?? '').trim();
  const phone = normaliseIndianPhone(body.phone ?? '');
  const hasProfileFields = Boolean(fullName && phone);
  const isNewSignupOtpStep = !existingCustomer && !hasProfileFields;
  const isNewSignupProfileStep = !existingCustomer && hasProfileFields;

  if (isNewSignupOtpStep) {
    const pendingVerification = await readSignupVerificationCookie();
    if (pendingVerification?.email === email) {
      return NextResponse.json(
        {
          ok: false,
          needsProfile: true,
          emailVerified: true,
          email,
          alreadyVerified: true,
        },
        { status: 200 },
      );
    }

    const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, {
      consume: false,
    });
    if (!verified.ok) {
      return NextResponse.json(verified, { status: 400 });
    }

    const challenge = await getActiveEmailOtpChallenge(verified.email);
    if (challenge) {
      await issueSignupVerificationCookie(challenge.id, verified.email, challenge.expiresAt);
    }
    return NextResponse.json(
      {
        ok: false,
        needsProfile: true,
        emailVerified: true,
        email: verified.email,
      },
      { status: 200 },
    );
  }

  if (isNewSignupProfileStep) {
    if (!fullName || fullName.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          needsProfile: true,
          email,
          message: 'Enter your full name to continue.',
        },
        { status: 400 },
      );
    }
    if (!phone) {
      return NextResponse.json(
        {
          ok: false,
          needsProfile: true,
          email,
          message: 'Enter a valid 10-digit mobile number.',
        },
        { status: 400 },
      );
    }

    const duplicateCustomer = await findCustomerByEmail(email);
    if (duplicateCustomer) {
      return finishNewSignupSession({ customer: duplicateCustomer, ip, userAgent });
    }

    const signupCookie = await readSignupVerificationCookie();
    let verified: { ok: true; email: string } | { ok: false; message: string };

    if (signupCookie?.email === email) {
      verified = await consumeEmailOtpChallengeById(signupCookie.challengeId, email, otpCtx);
      if (!verified.ok) {
        const recovered = await findCustomerByEmail(email);
        if (recovered) {
          return finishNewSignupSession({ customer: recovered, ip, userAgent });
        }
      }
    } else if (body.code?.trim()) {
      verified = await verifyEmailOtp(body.email ?? '', body.code, otpCtx, { consume: true });
    } else {
      const recovered = await findCustomerByEmail(email);
      if (recovered) {
        return finishNewSignupSession({ customer: recovered, ip, userAgent });
      }
      return NextResponse.json(
        { ok: false, message: SIGNUP_SETUP_EXPIRED_MESSAGE, needsNewCode: true },
        { status: 400 },
      );
    }

    if (!verified.ok) {
      const message = verified.message.includes('No active code')
        ? SIGNUP_SETUP_EXPIRED_MESSAGE
        : verified.message;
      return NextResponse.json(
        { ok: false, message, needsNewCode: true },
        { status: 400 },
      );
    }

    let customer;
    try {
      customer = await createCustomerProfile({
        email: verified.email,
        fullName,
        phone: phone!,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const recovered = await findCustomerByEmail(email);
        if (!recovered) throw err;
        return finishNewSignupSession({ customer: recovered, ip, userAgent });
      }
      throw err;
    }

    await createCustomerSession({
      customerId: customer.id,
      ip,
      userAgent,
    });
    await clearSignupVerificationCookie();

    return NextResponse.json({
      ok: true,
      customerId: customer.id,
      email: customer.email,
      phone: customer.phone,
      fullName: customer.fullName,
      mustSetPassword: !customer.passwordHash || customer.mustSetPassword,
    });
  }

  const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, {
    consume: Boolean(existingCustomer),
  });

  if (!verified.ok) {
    return NextResponse.json(verified, { status: 400 });
  }

  let customer = existingCustomer;
  if (!customer) {
    customer = await createCustomerProfile({
      email: verified.email,
      fullName,
      phone: phone!,
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
