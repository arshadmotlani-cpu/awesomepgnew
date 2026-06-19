import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { signupSessions, type SignupSessionRow } from '@/src/db/schema';
import { normaliseEmail } from '@/src/lib/email/address';
import { env } from '@/src/lib/env';
import { SIGNUP_SESSION_COOKIE } from '@/src/lib/auth/constants';

/** How long a signup may remain in progress after OTP verification. */
export const SIGNUP_SESSION_TTL_MS = 48 * 60 * 60_000;

export type SignupSessionStatus = 'pending' | 'completed' | 'expired';

function signPayload(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

function encodeCookieValue(sessionId: string, expiresAt: Date): string {
  const payload = `${sessionId}:${expiresAt.getTime()}`;
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${signPayload(payload)}`;
}

function decodeCookieValue(raw: string): { sessionId: string; expiresAt: Date } | null {
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
  const [sessionId, expStr] = payload.split(':');
  if (!sessionId || !expStr) return null;
  const expiresAt = new Date(Number(expStr));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return { sessionId, expiresAt };
}

export async function issueSignupSessionCookie(sessionId: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SIGNUP_SESSION_COOKIE, encodeCookieValue(sessionId, expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function readSignupSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(SIGNUP_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const decoded = decodeCookieValue(raw);
  return decoded?.sessionId ?? null;
}

export async function clearSignupSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SIGNUP_SESSION_COOKIE);
}

function sessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + SIGNUP_SESSION_TTL_MS);
}

export function isSignupSessionActive(row: SignupSessionRow): boolean {
  return row.status === 'pending' && row.expiresAt.getTime() > Date.now();
}

export async function getSignupSessionById(sessionId: string): Promise<SignupSessionRow | null> {
  const [row] = await db
    .select()
    .from(signupSessions)
    .where(
      and(
        eq(signupSessions.id, sessionId),
        eq(signupSessions.status, 'pending'),
        gt(signupSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getActiveSignupSessionForEmail(
  email: string,
): Promise<SignupSessionRow | null> {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  const [row] = await db
    .select()
    .from(signupSessions)
    .where(
      and(
        eq(signupSessions.email, normalised),
        eq(signupSessions.status, 'pending'),
        gt(signupSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(signupSessions.updatedAt))
    .limit(1);
  return row ?? null;
}

/** OTP verified — create or refresh pending signup session. Idempotent per email. */
export async function markSignupOtpVerified(email: string): Promise<SignupSessionRow> {
  const normalised = normaliseEmail(email);
  if (!normalised) throw new Error('Invalid email address.');

  const existing = await getActiveSignupSessionForEmail(normalised);
  const expiresAt = sessionExpiry();
  const now = new Date();

  if (existing) {
    const [updated] = await db
      .update(signupSessions)
      .set({
        otpVerified: true,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(signupSessions.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(signupSessions)
    .values({
      email: normalised,
      otpVerified: true,
      profileSubmitted: false,
      status: 'pending',
      expiresAt,
    })
    .returning();
  return created;
}

/** Profile step — update session only. Idempotent when same profile is re-submitted. */
export async function submitSignupProfile(args: {
  sessionId: string;
  fullName: string;
  phone: string;
}): Promise<SignupSessionRow> {
  const session = await getSignupSessionById(args.sessionId);
  if (!session) {
    throw new Error('Signup session expired. Please request a new code and start again.');
  }
  if (!session.otpVerified) {
    throw new Error('Verify your email with a one-time code first.');
  }

  const expiresAt = sessionExpiry();
  const [updated] = await db
    .update(signupSessions)
    .set({
      fullName: args.fullName.trim(),
      phone: args.phone,
      profileSubmitted: true,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(signupSessions.id, session.id))
    .returning();
  return updated;
}

export async function completeSignupSession(sessionId: string): Promise<void> {
  await db
    .update(signupSessions)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(signupSessions.id, sessionId));
  await clearSignupSessionCookie();
}

export async function readSignupSessionFromRequest(): Promise<SignupSessionRow | null> {
  const sessionId = await readSignupSessionCookie();
  if (!sessionId) return null;
  return getSignupSessionById(sessionId);
}

export function signupSessionPublicState(row: SignupSessionRow) {
  return {
    sessionId: row.id,
    email: row.email,
    otpVerified: row.otpVerified,
    profileSubmitted: row.profileSubmitted,
    fullName: row.fullName,
    phone: row.phone,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
  };
}
