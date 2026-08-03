import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { startResidentImpersonation } from '@/src/lib/auth/impersonation';
import { IMPERSONATION_DEFAULT_REASON } from '@/src/lib/auth/impersonationPolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StartBody = {
  customerId?: string;
  reason?: string;
  returnPath?: string;
};

export async function POST(request: Request) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return NextResponse.json({ ok: false, error: 'Admin sign-in required.' }, { status: 401 });
  }
  if (adminSession.role !== 'super_admin') {
    return NextResponse.json(
      { ok: false, error: 'Only Super Admin can impersonate residents.' },
      { status: 403 },
    );
  }

  let body: StartBody;
  try {
    body = (await request.json()) as StartBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  if (!customerId) {
    return NextResponse.json({ ok: false, error: 'customerId is required.' }, { status: 400 });
  }

  const result = await startResidentImpersonation({
    adminSession,
    customerId,
    reason: body.reason?.trim() || IMPERSONATION_DEFAULT_REASON,
    returnPath: body.returnPath,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, redirectTo: result.redirectTo });
}
