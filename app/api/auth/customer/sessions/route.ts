import { NextResponse } from 'next/server';
import { listActiveCustomerSessions } from '@/src/lib/auth/customerSessions';
import { getImpersonationCredentialBlock } from '@/src/lib/auth/impersonationGuards';
import { destroyAllCustomerSessions, getCustomerSession } from '@/src/lib/auth/session';

export async function GET() {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const impersonationBlock = await getImpersonationCredentialBlock();
  if (impersonationBlock.blocked) {
    return NextResponse.json({ ok: false, message: impersonationBlock.message }, { status: 403 });
  }

  const sessions = await listActiveCustomerSessions(session.customerId, session.sessionId);
  return NextResponse.json({
    ok: true,
    sessions: sessions.map((row) => ({
      id: row.id,
      deviceLabel: row.deviceLabel,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      rememberMe: row.rememberMe,
      isCurrent: row.isCurrent,
    })),
    currentSessionId: session.sessionId,
    expiresAt: session.expiresAt.toISOString(),
    rememberMe: session.rememberMe,
  });
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const impersonationBlock = await getImpersonationCredentialBlock();
  if (impersonationBlock.blocked) {
    return NextResponse.json({ ok: false, message: impersonationBlock.message }, { status: 403 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  if (body.action !== 'revoke_all') {
    return NextResponse.json({ ok: false, message: 'Unsupported action.' }, { status: 400 });
  }

  await destroyAllCustomerSessions(session.customerId, { exceptCurrentSession: false });
  return NextResponse.json({ ok: true, signedOut: true });
}
