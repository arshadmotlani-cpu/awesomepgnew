import { NextResponse } from 'next/server';
import { endResidentImpersonation } from '@/src/lib/auth/impersonation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EndBody = {
  exitReason?: string;
};

export async function POST(request: Request) {
  let body: EndBody = {};
  try {
    body = (await request.json()) as EndBody;
  } catch {
    // empty body is fine
  }

  const result = await endResidentImpersonation({
    exitReason: body.exitReason ?? 'admin_return',
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, redirectTo: result.redirectTo });
}
