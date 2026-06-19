import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { emailOtpChallenges } from '@/src/db/schema';
import { normaliseEmail } from '@/src/lib/email/address';
import { notifyVerificationCode } from '@/src/lib/email/notifications';
import { env } from '@/src/lib/env';
import { safeEqual, sha256 } from './crypto';
import { logOtpAttempt } from './otpAttemptLog';
import {
  countOtpSendsForEmail,
  countOtpSendsForIp,
  latestOtpSendForEmail,
  resendAvailableAt,
  secondsUntilResend,
} from './otpRateLimit';

const MAX_VERIFY_ATTEMPTS = 5;

function generateOtpCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

export type SendOtpContext = {
  ip?: string | null;
  userAgent?: string | null;
};

export type VerifyOtpContext = {
  ip?: string | null;
  userAgent?: string | null;
};

export async function sendEmailOtp(
  rawEmail: string,
  ctx: SendOtpContext = {},
): Promise<
  | {
      ok: true;
      email: string;
      expiresAt: Date;
      resendAfter: string;
      delivery: { provider: string; messageId?: string };
    }
  | { ok: false; message: string; retryAfterSeconds?: number; rateLimited?: boolean }
> {
  const email = normaliseEmail(rawEmail);
  if (!email) {
    await logOtpAttempt({
      email: rawEmail.trim() || 'invalid',
      action: 'send',
      success: false,
      reason: 'invalid_email',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'Enter a valid email address.' };
  }

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60_000);

  const lastSent = await latestOtpSendForEmail(email);
  if (lastSent) {
    const wait = secondsUntilResend(lastSent, env.AUTH_OTP_RESEND_SECONDS, now);
    if (wait > 0) {
      await logOtpAttempt({
        email,
        action: 'send',
        success: false,
        reason: 'resend_cooldown',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        ok: false,
        message: `Wait ${wait} seconds before requesting another code.`,
        retryAfterSeconds: wait,
      };
    }
  }

  const emailSends = await countOtpSendsForEmail(email, hourAgo);
  if (emailSends >= env.AUTH_OTP_MAX_SENDS_PER_HOUR) {
    await logOtpAttempt({
      email,
      action: 'send',
      success: false,
      reason: 'email_rate_limit',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      ok: false,
      message: 'Too many attempts. Please wait 60 minutes before requesting a new code.',
      rateLimited: true,
      retryAfterSeconds: 3600,
    };
  }

  if (ctx.ip) {
    const ipSends = await countOtpSendsForIp(ctx.ip, hourAgo);
    if (ipSends >= env.AUTH_OTP_MAX_SENDS_PER_IP_HOUR) {
      await logOtpAttempt({
        email,
        action: 'send',
        success: false,
        reason: 'ip_rate_limit',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        ok: false,
        message: 'Too many attempts. Please wait 60 minutes before requesting a new code.',
        rateLimited: true,
        retryAfterSeconds: 3600,
      };
    }
  }

  const code = generateOtpCode();
  const expiresAt = new Date(now.getTime() + env.AUTH_OTP_TTL_MINUTES * 60_000);

  const delivered = await notifyVerificationCode({ email, code });
  if (!delivered.ok) {
    await logOtpAttempt({
      email,
      action: 'send',
      success: false,
      reason: 'email_delivery_failed',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: delivered.message };
  }
  if (delivered.delivery.provider === 'log' && env.NODE_ENV === 'production') {
    await logOtpAttempt({
      email,
      action: 'send',
      success: false,
      reason: 'email_not_configured',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      ok: false,
      message: 'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.',
    };
  }

  await db.insert(emailOtpChallenges).values({
    email,
    codeHash: sha256(code),
    expiresAt,
  });

  await logOtpAttempt({
    email,
    action: 'send',
    success: true,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  const resendAfter = resendAvailableAt(now, env.AUTH_OTP_RESEND_SECONDS);
  return {
    ok: true,
    email,
    expiresAt,
    resendAfter: resendAfter.toISOString(),
    delivery: delivered.delivery,
  };
}

export type VerifyOtpOptions = {
  /** When false, a valid code is accepted but not marked consumed (signup OTP step). */
  consume?: boolean;
};

export async function getActiveEmailOtpChallenge(email: string) {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  const [challenge] = await db
    .select()
    .from(emailOtpChallenges)
    .where(eq(emailOtpChallenges.email, normalised))
    .orderBy(desc(emailOtpChallenges.createdAt))
    .limit(1);
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    return null;
  }
  return challenge;
}

export async function consumeEmailOtpChallengeById(
  challengeId: string,
  rawEmail: string,
  ctx: VerifyOtpContext = {},
): Promise<
  { ok: true; email: string; alreadyConsumed?: boolean } | { ok: false; message: string }
> {
  const email = normaliseEmail(rawEmail);
  if (!email) {
    return { ok: false, message: 'Invalid email address.' };
  }

  const [challenge] = await db
    .select()
    .from(emailOtpChallenges)
    .where(eq(emailOtpChallenges.id, challengeId))
    .limit(1);

  if (!challenge || challenge.email !== email) {
    await logOtpAttempt({
      email,
      action: 'verify_fail',
      success: false,
      reason: 'no_active_challenge',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'No active code for this email. Request a new one.' };
  }

  if (challenge.consumedAt) {
    return { ok: true, email, alreadyConsumed: true };
  }
  if (challenge.expiresAt <= new Date()) {
    await logOtpAttempt({
      email,
      action: 'verify_fail',
      success: false,
      reason: 'expired',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'Code expired. Request a new one.' };
  }

  await db
    .update(emailOtpChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(emailOtpChallenges.id, challenge.id));

  await logOtpAttempt({
    email,
    action: 'verify_success',
    success: true,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { ok: true, email };
}

export async function verifyEmailOtp(
  rawEmail: string,
  code: string,
  ctx: VerifyOtpContext = {},
  opts: VerifyOtpOptions = {},
): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  const consume = opts.consume !== false;
  const email = normaliseEmail(rawEmail);
  if (!email) {
    await logOtpAttempt({
      email: rawEmail.trim() || 'invalid',
      action: 'verify_fail',
      success: false,
      reason: 'invalid_email',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'Invalid email address.' };
  }

  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    await logOtpAttempt({
      email,
      action: 'verify_fail',
      success: false,
      reason: 'invalid_code_format',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'Enter the 6-digit code.' };
  }

  const [challenge] = await db
    .select()
    .from(emailOtpChallenges)
    .where(eq(emailOtpChallenges.email, email))
    .orderBy(desc(emailOtpChallenges.createdAt))
    .limit(1);

  if (!challenge || challenge.consumedAt) {
    await logOtpAttempt({
      email,
      action: 'verify_fail',
      success: false,
      reason: 'no_active_challenge',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'No active code for this email. Request a new one.' };
  }
  if (challenge.expiresAt <= new Date()) {
    await logOtpAttempt({
      email,
      action: 'verify_fail',
      success: false,
      reason: 'expired',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'Code expired. Request a new one.' };
  }
  if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
    await logOtpAttempt({
      email,
      action: 'verify_fail',
      success: false,
      reason: 'max_attempts',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'Too many attempts. Request a new code.' };
  }

  const valid = safeEqual(sha256(trimmed), challenge.codeHash);
  if (!valid) {
    await db
      .update(emailOtpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(emailOtpChallenges.id, challenge.id));
    await logOtpAttempt({
      email,
      action: 'verify_fail',
      success: false,
      reason: 'incorrect_code',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, message: 'Incorrect code.' };
  }

  if (consume) {
    await db
      .update(emailOtpChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(emailOtpChallenges.id, challenge.id));

    await logOtpAttempt({
      email,
      action: 'verify_success',
      success: true,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  return { ok: true, email };
}
