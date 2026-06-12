import { NextResponse } from 'next/server';
import { findCustomerByEmail, setCustomerPassword } from '@/src/lib/auth/customer';
import { verifyPassword } from '@/src/lib/auth/crypto';
import { validateCustomerPassword } from '@/src/lib/auth/password';
import { getCustomerSession } from '@/src/lib/auth/session';

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }
  if (session.mustSetPassword) {
    return NextResponse.json(
      { ok: false, message: 'Finish setting your password first.' },
      { status: 400 },
    );
  }

  let body: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? '';
  const newPassword = body.newPassword ?? '';
  const confirmPassword = body.confirmPassword ?? '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      { ok: false, message: 'Current password, new password, and confirmation are required.' },
      { status: 400 },
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ ok: false, message: 'New passwords do not match.' }, { status: 400 });
  }

  const policyError = validateCustomerPassword(newPassword);
  if (policyError) {
    return NextResponse.json({ ok: false, message: policyError }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { ok: false, message: 'New password must be different from the current password.' },
      { status: 400 },
    );
  }

  const customer = await findCustomerByEmail(session.email);
  if (!customer?.passwordHash || !verifyPassword(currentPassword, customer.passwordHash)) {
    return NextResponse.json({ ok: false, message: 'Current password is incorrect.' }, { status: 401 });
  }

  await setCustomerPassword(session.customerId, newPassword);

  return NextResponse.json({ ok: true });
}
