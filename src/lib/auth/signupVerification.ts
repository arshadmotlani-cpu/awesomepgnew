import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { normaliseEmail } from '@/src/lib/email/address';
import { env } from '@/src/lib/env';

export const SIGNUP_VERIFICATION_COOKIE = 'apg_signup_verified';

export type SignupVerification = {
  challengeId: string;
  email: string;
};

function signPayload(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

function encodeCookieValue(challengeId: string, email: string, expiresAt: Date): string {
  const payload = `${challengeId}:${email}:${expiresAt.getTime()}`;
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${signPayload(payload)}`;
}

function decodeCookieValue(raw: string): SignupVerification & { expiresAt: Date } | null {
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
  const [challengeId, email, expStr] = payload.split(':');
  if (!challengeId || !email || !expStr) return null;
  const expiresAt = new Date(Number(expStr));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  return { challengeId, email: normalised, expiresAt };
}

export async function issueSignupVerificationCookie(
  challengeId: string,
  email: string,
  expiresAt: Date,
): Promise<void> {
  const normalised = normaliseEmail(email);
  if (!normalised) return;
  const jar = await cookies();
  jar.set(SIGNUP_VERIFICATION_COOKIE, encodeCookieValue(challengeId, normalised, expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function readSignupVerificationCookie(): Promise<SignupVerification | null> {
  const jar = await cookies();
  const raw = jar.get(SIGNUP_VERIFICATION_COOKIE)?.value;
  if (!raw) return null;
  const decoded = decodeCookieValue(raw);
  if (!decoded) return null;
  return { challengeId: decoded.challengeId, email: decoded.email };
}

export async function clearSignupVerificationCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SIGNUP_VERIFICATION_COOKIE);
}

/** Plain-language copy for signup steps after OTP verification. */
export const SIGNUP_SETUP_EXPIRED_MESSAGE =
  "We couldn't finish setting up your account. Please request a new code and try again.";
