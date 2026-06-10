import { NextResponse } from 'next/server';
import { destroyAdminSession, destroyCustomerSession } from '@/src/lib/auth/session';

export async function POST(request: Request) {
  let body: { scope?: string };
  try {
    body = (await request.json()) as { scope?: string };
  } catch {
    body = {};
  }
  if (body.scope === 'admin') {
    await destroyAdminSession();
  } else if (body.scope === 'customer') {
    await destroyCustomerSession();
  } else {
    await destroyCustomerSession();
    await destroyAdminSession();
  }
  return NextResponse.json({ ok: true });
}
