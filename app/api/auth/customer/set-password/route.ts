import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { setCustomerPassword } from '@/src/lib/auth/customer';
import { validateCustomerPassword } from '@/src/lib/auth/password';
import { getCustomerSession } from '@/src/lib/auth/session';

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }
  if (!session.mustSetPassword) {
    return NextResponse.json({ ok: false, message: 'Password is already set.' }, { status: 400 });
  }

  let body: { password?: string; confirmPassword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const password = body.password ?? '';
  const confirmPassword = body.confirmPassword ?? '';
  if (!password || !confirmPassword) {
    return NextResponse.json(
      { ok: false, message: 'Password and confirmation are required.' },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ ok: false, message: 'Passwords do not match.' }, { status: 400 });
  }

  const policyError = validateCustomerPassword(password);
  if (policyError) {
    return NextResponse.json({ ok: false, message: policyError }, { status: 400 });
  }

  await setCustomerPassword(session.customerId, password);

  const [customer] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.id, session.customerId))
    .limit(1);

  return NextResponse.json({
    ok: true,
    email: customer?.email ?? session.email,
    mustSetPassword: false,
  });
}
