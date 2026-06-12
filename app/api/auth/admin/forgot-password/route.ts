import { NextResponse } from 'next/server';
import {
  getAdminRecoveryConfig,
  requestAdminPasswordReset,
} from '@/src/lib/auth/adminPasswordReset';

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const result = await requestAdminPasswordReset({
    email: body.email ?? '',
    ip,
  });

  if (!result.ok) {
    return NextResponse.json(result, {
      status: result.retryAfterSeconds ? 429 : 400,
    });
  }

  return NextResponse.json(result);
}

export async function GET() {
  const config = getAdminRecoveryConfig();
  return NextResponse.json({
    configured: config.configured,
    maskedRecoveryEmail: config.maskedRecoveryEmail,
  });
}
