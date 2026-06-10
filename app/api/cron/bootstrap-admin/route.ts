import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema';
import { hashPassword } from '@/src/lib/auth/crypto';
import { env } from '@/src/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SEED_ADMIN_EMAIL = 'admin@awesomepg.local';

/**
 * One-time production bootstrap for the first admin account.
 * Requires `ADMIN_INITIAL_PASSWORD` on the server and the same value as
 * `Authorization: Bearer <ADMIN_INITIAL_PASSWORD>`.
 */
async function handle(req: NextRequest) {
  const bootstrapPassword = env.ADMIN_INITIAL_PASSWORD;
  if (!bootstrapPassword) {
    return Response.json(
      { ok: false, reason: 'ADMIN_INITIAL_PASSWORD is not configured on the server' },
      { status: 500 },
    );
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${bootstrapPassword}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, SEED_ADMIN_EMAIL))
    .limit(1);

  const passwordHash = hashPassword(bootstrapPassword);

  if (existing) {
    await db
      .update(adminUsers)
      .set({
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.email, SEED_ADMIN_EMAIL));
  } else {
    await db.insert(adminUsers).values({
      fullName: 'Super Admin',
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      role: 'super_admin',
      pgScope: [],
      isActive: true,
      mustChangePassword: false,
    });
  }

  return Response.json({
    ok: true,
    email: SEED_ADMIN_EMAIL,
    created: !existing,
    updated: Boolean(existing),
  });
}

export const GET = handle;
export const POST = handle;
