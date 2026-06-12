import { NextResponse } from 'next/server';
import {
  completeAdminPasswordReset,
  validateAdminResetToken,
} from '@/src/lib/auth/adminPasswordReset';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') ?? '';
  const validation = await validateAdminResetToken(token);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, message: validation.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, email: validation.email });
}

export async function POST(request: Request) {
  let body: { token?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await completeAdminPasswordReset({
    token: body.token ?? '',
    newPassword: body.newPassword ?? '',
    confirmPassword: body.confirmPassword ?? '',
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
