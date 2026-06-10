import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/src/db/client';
import { adminUsers, auditLog } from '@/src/db/schema';
import { hashPassword, verifyPassword } from '@/src/lib/auth/crypto';
import { validateAdminPassword } from '@/src/lib/auth/password';
import { getAdminSession } from '@/src/lib/auth/session';

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
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

  const policyError = validateAdminPassword(newPassword);
  if (policyError) {
    return NextResponse.json({ ok: false, message: policyError }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { ok: false, message: 'New password must be different from the current password.' },
      { status: 400 },
    );
  }

  const [admin] = await db
    .select({
      id: adminUsers.id,
      passwordHash: adminUsers.passwordHash,
      isActive: adminUsers.isActive,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.adminId))
    .limit(1);

  if (!admin || !admin.isActive || !verifyPassword(currentPassword, admin.passwordHash)) {
    return NextResponse.json(
      { ok: false, message: 'Current password is incorrect.' },
      { status: 401 },
    );
  }

  const passwordHash = hashPassword(newPassword);
  await db
    .update(adminUsers)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, admin.id));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: admin.id,
    entity: 'admin_user',
    entityId: admin.id,
    action: 'change_password',
    diff: { forced: session.mustChangePassword },
  });

  return NextResponse.json({ ok: true });
}
