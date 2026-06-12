import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema';
import { hashPassword } from '@/src/lib/auth/crypto';
import { SEED_ADMIN_EMAIL } from '@/src/lib/auth/adminPasswordReset';
import { env } from '@/src/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One-time production bootstrap for the first admin account.
 * Creates the account only — never resets an existing admin password.
 * Requires `ADMIN_INITIAL_PASSWORD` and `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(req: NextRequest) {
  const bootstrapPassword = env.ADMIN_INITIAL_PASSWORD;
  if (!bootstrapPassword) {
    return Response.json(
      { ok: false, reason: 'ADMIN_INITIAL_PASSWORD is not configured on the server' },
      { status: 500 },
    );
  }

  const cronSecret = env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const expectedAuth = cronSecret
    ? `Bearer ${cronSecret}`
    : `Bearer ${bootstrapPassword}`;
  if (auth !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, SEED_ADMIN_EMAIL))
    .limit(1);

  if (existing) {
    return Response.json({
      ok: true,
      email: SEED_ADMIN_EMAIL,
      created: false,
      message: 'Admin account already exists. Use forgot password to reset credentials.',
    });
  }

  const passwordHash = hashPassword(bootstrapPassword);
  await db.insert(adminUsers).values({
    fullName: 'Super Admin',
    email: SEED_ADMIN_EMAIL,
    passwordHash,
    role: 'super_admin',
    pgScope: [],
    isActive: true,
    mustChangePassword: false,
  });

  return Response.json({
    ok: true,
    email: SEED_ADMIN_EMAIL,
    created: true,
    updated: false,
  });
}

export const GET = handle;
export const POST = handle;
