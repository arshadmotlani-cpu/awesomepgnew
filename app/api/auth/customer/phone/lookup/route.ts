import { NextResponse } from 'next/server';
import { findCustomerByPhone, isAccountComplete } from '@/src/lib/auth/customer';
import { maskEmailForDisplay } from '@/src/lib/auth/loginIdentifier';
import { normaliseIndianPhone } from '@/src/lib/phone';

/** Check whether a mobile number already belongs to a complete account (signup guard). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const phone = normaliseIndianPhone(url.searchParams.get('phone') ?? '');
  if (!phone) {
    return NextResponse.json({ ok: false, message: 'Invalid mobile number.' }, { status: 400 });
  }

  const customer = await findCustomerByPhone(phone);
  if (!customer || customer.archivedAt || !isAccountComplete(customer)) {
    return NextResponse.json({ ok: true, exists: false });
  }

  return NextResponse.json({
    ok: true,
    exists: true,
    existingAccountByPhone: true,
    maskedEmail: maskEmailForDisplay(customer.email),
    message: 'We found an existing account with this phone number.',
  });
}
