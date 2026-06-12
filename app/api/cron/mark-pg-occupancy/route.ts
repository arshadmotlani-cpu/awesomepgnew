import { NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import {
  findPgIdsByNamePatterns,
  markPgsFullyOccupiedByPatterns,
} from '@/src/services/occupancyAdmin';
import type { AdminSession } from '@/src/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bootstrapSession: AdminSession = {
  kind: 'admin',
  sessionId: 'cron',
  adminId: null as unknown as string,
  email: 'cron@awesomepg.internal',
  fullName: 'Cron',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

function parseList(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Mark vacant beds occupied via admin occupancy placeholders.
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Query:
 *   ?names=central          (comma-separated PG name substrings)
 *   &exclude=female         (optional substrings to skip)
 */
async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, reason: 'CRON_SECRET is not configured on the server' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const patterns = parseList(req.nextUrl.searchParams.get('names'));
  if (patterns.length === 0) {
    return Response.json(
      { ok: false, reason: 'Pass ?names=central (comma-separated substrings)' },
      { status: 400 },
    );
  }

  const excludePatterns = parseList(req.nextUrl.searchParams.get('exclude'));
  const options = excludePatterns.length > 0 ? { excludePatterns } : undefined;

  const matches = await findPgIdsByNamePatterns(patterns, options);
  if (matches.length === 0) {
    return Response.json({
      ok: false,
      reason: `No PG matched patterns: ${patterns.join(', ')}`,
      patterns,
      excludePatterns,
    });
  }

  const results = await markPgsFullyOccupiedByPatterns(
    bootstrapSession,
    patterns,
    options,
  );
  return Response.json({ ok: true, patterns, excludePatterns, results });
}

export const GET = handle;
export const POST = handle;
