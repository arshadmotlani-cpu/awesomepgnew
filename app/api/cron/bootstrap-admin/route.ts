import { NextRequest } from 'next/server';
import { db } from '@/src/db/client';
import { bootstrapAdminIfNeeded } from '@/src/lib/auth/bootstrapAdmin';
import { resolveEcosystemAdminEmail, resolveEcosystemAdminPassword } from '@/src/lib/auth/ecosystemAdmin';
import { env } from '@/src/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Production bootstrap / credential refresh for the ecosystem PG admin account.
 * Requires ECOSYSTEM_ADMIN_PASSWORD (or ADMIN_INITIAL_PASSWORD) and CRON auth.
 */
async function handle(req: NextRequest) {
  const bootstrapPassword = resolveEcosystemAdminPassword();
  if (!bootstrapPassword) {
    return Response.json(
      {
        ok: false,
        reason: 'ECOSYSTEM_ADMIN_PASSWORD (or ADMIN_INITIAL_PASSWORD) is not configured on the server',
      },
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

  const result = await bootstrapAdminIfNeeded();
  const email = resolveEcosystemAdminEmail();

  return Response.json({
    ok: true,
    email,
    created: result === 'created',
    updated: result === 'updated',
    skipped: result === 'skipped',
  });
}

export const GET = handle;
export const POST = handle;
