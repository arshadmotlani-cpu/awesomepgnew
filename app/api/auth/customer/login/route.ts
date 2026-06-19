import { NextResponse } from 'next/server';
import { findCustomerByEmail } from '@/src/lib/auth/customer';
import { getActiveSignupSessionForEmail } from '@/src/lib/auth/signupSession';
import { verifyPassword } from '@/src/lib/auth/crypto';
import { createCustomerSession } from '@/src/lib/auth/session';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, message: 'Email and password are required.' },
      { status: 400 },
    );
  }

  const customer = await findCustomerByEmail(email);
  if (!customer || customer.archivedAt) {
    const pendingSignup = await getActiveSignupSessionForEmail(email);
    if (pendingSignup) {
      return NextResponse.json(
        {
          ok: false,
          needsCompleteSignup: true,
          message:
            'This account is not finished yet. Use Forgot password — we will email you a code to complete setup.',
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, message: 'Invalid email or password.' }, { status: 401 });
  }

  if (!customer.passwordHash) {
    return NextResponse.json(
      {
        ok: false,
        needsCompleteSignup: true,
        message:
          'No password on this account yet. Use Forgot password — we will email you a code to finish setup.',
      },
      { status: 400 },
    );
  }

  if (!verifyPassword(password, customer.passwordHash)) {
    return NextResponse.json(
      {
        ok: false,
        accountExists: true,
        message: 'Incorrect password. Try again or use Forgot password.',
      },
      { status: 401 },
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  await createCustomerSession({ customerId: customer.id, ip, userAgent });

  return NextResponse.json({
    ok: true,
    customerId: customer.id,
    email: customer.email,
    mustSetPassword: customer.mustSetPassword,
  });
}
