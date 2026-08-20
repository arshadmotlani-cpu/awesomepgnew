import { createHmac, timingSafeEqual } from 'node:crypto';

function sessionSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.PLATFORM_SESSION_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    'dev-platform-session-secret-change-me'
  );
}

function verifySigned(value: string): string | null {
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return payload;
}

export type PlatformSessionCookiePayload = {
  userId: string;
  exp: number;
};

/** Middleware-safe cookie check — signature + expiry only (no DB). */
export function readPlatformSessionCookiePayload(
  raw: string | undefined,
): PlatformSessionCookiePayload | null {
  if (!raw) return null;
  const payload = verifySigned(raw);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      exp?: number;
    };
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) return null;
    return { userId: parsed.userId, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function signPlatformSessionPayload(userId: string, expiresAt: Date): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: expiresAt.getTime(), v: 1 }),
    'utf8',
  ).toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
