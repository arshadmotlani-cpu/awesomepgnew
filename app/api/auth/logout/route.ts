import { NextResponse } from 'next/server';
import { endResidentImpersonation } from '@/src/lib/auth/impersonation';
import { IMPERSONATION_COOKIE } from '@/src/lib/auth/constants';
import { destroyAdminSession, destroyCustomerSession } from '@/src/lib/auth/session';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  let body: { scope?: string };
  try {
    body = (await request.json()) as { scope?: string };
  } catch {
    body = {};
  }

  const jar = await cookies();
  const impersonating = Boolean(jar.get(IMPERSONATION_COOKIE)?.value);

  if (body.scope === 'admin') {
    await destroyAdminSession();
  } else if (body.scope === 'customer') {
    if (impersonating) {
      await endResidentImpersonation({ exitReason: 'customer_logout_while_impersonating' });
    } else {
      await destroyCustomerSession();
    }
  } else {
    if (impersonating) {
      await endResidentImpersonation({ exitReason: 'full_logout_while_impersonating' });
    } else {
      await destroyCustomerSession();
    }
    await destroyAdminSession();
  }
  return NextResponse.json({ ok: true });
}
