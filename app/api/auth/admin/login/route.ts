import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema';
import { verifyPassword } from '@/src/lib/auth/crypto';
import { createAdminSession } from '@/src/lib/auth/session';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) {
    return NextResponse.json({ ok: false, message: 'Email and password are required.' }, { status: 400 });
  }

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (!admin || !admin.isActive || !verifyPassword(password, admin.passwordHash)) {
    return NextResponse.json({ ok: false, message: 'Invalid email or password.' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  await createAdminSession({ adminId: admin.id, ip, userAgent });

  return NextResponse.json({
    ok: true,
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    mustChangePassword: admin.mustChangePassword,
  });
}
