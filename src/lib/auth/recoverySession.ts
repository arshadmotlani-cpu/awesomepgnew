import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { normaliseEmail } from '@/src/lib/email/address';
import { env } from '@/src/lib/env';

/** Survives login-page cookie clears — backs account recovery after OTP. */
export const RECOVERY_COOKIE = 'apg_account_recovery';
export const RECOVERY_TTL_MS = 48 * 60 * 60_000;

function signPayload(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

function encodeValue(email: string, expiresAt: Date): string {
  const payload = `${email}:${expiresAt.getTime()}`;
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${signPayload(payload)}`;
}

function decodeValue(raw: string): { email: string; expiresAt: Date } | null {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expectedSig = signPayload(payload);
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  const [email, expStr] = payload.split(':');
  if (!email || !expStr) return null;
  const expiresAt = new Date(Number(expStr));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return { email, expiresAt };
}

export async function issueRecoveryCookie(rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  if (!email) return;
  const expiresAt = new Date(Date.now() + RECOVERY_TTL_MS);
  const jar = await cookies();
  jar.set(RECOVERY_COOKIE, encodeValue(email, expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function readRecoveryEmail(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(RECOVERY_COOKIE)?.value;
  if (!raw) return null;
  const decoded = decodeValue(raw);
  return decoded ? normaliseEmail(decoded.email) : null;
}

export async function clearRecoveryCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(RECOVERY_COOKIE);
}

export async function isRecoveryVerifiedForEmail(rawEmail: string): Promise<boolean> {
  const email = normaliseEmail(rawEmail);
  if (!email) return false;
  const recovered = await readRecoveryEmail();
  return recovered === email;
}
