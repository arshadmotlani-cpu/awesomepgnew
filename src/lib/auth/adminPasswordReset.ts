import { and, desc, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminPasswordResetTokens, adminUsers } from '@/src/db/schema';
import { sendEmail } from '@/src/lib/email/send';
import { getAppBaseUrl, maskEmail } from '@/src/lib/appUrl';
import { env } from '@/src/lib/env';
import { hashPassword, randomToken, sha256 } from './crypto';
import { validateAdminPassword } from './password';
import { secondsUntilResend } from './otpRateLimit';

export const SEED_ADMIN_EMAIL = 'admin@awesomepg.local';

function resetTokenExpiry(): Date {
  return new Date(Date.now() + env.AUTH_ADMIN_RESET_TOKEN_MINUTES * 60_000);
}

export type AdminRecoveryConfig = {
  configured: boolean;
  recoveryEmail: string | null;
  maskedRecoveryEmail: string | null;
};

export function getAdminRecoveryConfig(): AdminRecoveryConfig {
  const recoveryEmail = env.ADMIN_RECOVERY_EMAIL ?? null;
  if (!recoveryEmail) {
    return { configured: false, recoveryEmail: null, maskedRecoveryEmail: null };
  }
  return {
    configured: true,
    recoveryEmail,
    maskedRecoveryEmail: maskEmail(recoveryEmail),
  };
}

async function latestResetRequestAt(adminId: string): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: adminPasswordResetTokens.createdAt })
    .from(adminPasswordResetTokens)
    .where(eq(adminPasswordResetTokens.adminId, adminId))
    .orderBy(desc(adminPasswordResetTokens.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

async function countRecentResetRequests(adminId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminPasswordResetTokens)
    .where(
      and(
        eq(adminPasswordResetTokens.adminId, adminId),
        gte(adminPasswordResetTokens.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function requestAdminPasswordReset(args: {
  email: string;
  ip?: string | null;
}): Promise<
  | { ok: true; message: string }
  | { ok: false; message: string; retryAfterSeconds?: number }
> {
  const recoveryEmail = env.ADMIN_RECOVERY_EMAIL;
  if (!recoveryEmail) {
    return {
      ok: false,
      message:
        'Password recovery is not configured. Ask your operator to set ADMIN_RECOVERY_EMAIL.',
    };
  }

  const email = args.email.trim().toLowerCase();
  if (!email) {
    return { ok: false, message: 'Enter your admin account email.' };
  }

  const genericSuccess =
    'If that account exists, a reset link has been sent to the configured recovery inbox.';

  const [admin] = await db
    .select({ id: adminUsers.id, email: adminUsers.email, isActive: adminUsers.isActive })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (!admin || !admin.isActive) {
    return { ok: true, message: genericSuccess };
  }

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60_000);

  const lastSent = await latestResetRequestAt(admin.id);
  if (lastSent) {
    const wait = secondsUntilResend(lastSent, env.AUTH_ADMIN_RESET_RESEND_SECONDS, now);
    if (wait > 0) {
      return {
        ok: false,
        message: `Wait ${wait} seconds before requesting another reset link.`,
        retryAfterSeconds: wait,
      };
    }
  }

  const hourlyCount = await countRecentResetRequests(admin.id, hourAgo);
  if (hourlyCount >= env.AUTH_ADMIN_RESET_MAX_PER_HOUR) {
    return {
      ok: false,
      message: 'Too many reset requests. Try again in about an hour.',
    };
  }

  const token = randomToken();
  await db.insert(adminPasswordResetTokens).values({
    adminId: admin.id,
    tokenHash: sha256(token),
    expiresAt: resetTokenExpiry(),
  });

  const resetUrl = `${getAppBaseUrl()}/admin/reset-password?token=${encodeURIComponent(token)}`;
  const minutes = env.AUTH_ADMIN_RESET_TOKEN_MINUTES;

  const sendResult = await sendEmail({
    to: recoveryEmail,
    subject: 'Reset your Awesome PG admin password',
    text: [
      'A password reset was requested for the Awesome PG admin console.',
      '',
      `Account: ${admin.email}`,
      '',
      `Reset your password (link expires in ${minutes} minutes):`,
      resetUrl,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: [
      '<p>A password reset was requested for the Awesome PG admin console.</p>',
      `<p><strong>Account:</strong> ${admin.email}</p>`,
      `<p><a href="${resetUrl}">Reset your password</a> (expires in ${minutes} minutes)</p>`,
      '<p>If you did not request this, you can ignore this email.</p>',
    ].join(''),
  });

  if (!sendResult.ok) {
    console.error('[admin-auth] password reset email failed');
    return {
      ok: false,
      message: 'Could not send the reset email. Try again shortly.',
    };
  }

  return { ok: true, message: genericSuccess };
}

export async function validateAdminResetToken(rawToken: string): Promise<
  | { ok: true; adminId: string; tokenId: string; email: string }
  | { ok: false; message: string }
> {
  const token = rawToken.trim();
  if (!token) {
    return { ok: false, message: 'Reset link is invalid or has expired.' };
  }

  const [row] = await db
    .select({
      tokenId: adminPasswordResetTokens.id,
      adminId: adminPasswordResetTokens.adminId,
      expiresAt: adminPasswordResetTokens.expiresAt,
      consumedAt: adminPasswordResetTokens.consumedAt,
      email: adminUsers.email,
      isActive: adminUsers.isActive,
    })
    .from(adminPasswordResetTokens)
    .innerJoin(adminUsers, eq(adminUsers.id, adminPasswordResetTokens.adminId))
    .where(
      and(
        eq(adminPasswordResetTokens.tokenHash, sha256(token)),
        isNull(adminPasswordResetTokens.consumedAt),
        gt(adminPasswordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row || !row.isActive) {
    return { ok: false, message: 'Reset link is invalid or has expired.' };
  }

  return {
    ok: true,
    adminId: row.adminId,
    tokenId: row.tokenId,
    email: row.email,
  };
}

export async function completeAdminPasswordReset(args: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const newPassword = args.newPassword ?? '';
  const confirmPassword = args.confirmPassword ?? '';

  if (!newPassword || !confirmPassword) {
    return { ok: false, message: 'New password and confirmation are required.' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, message: 'Passwords do not match.' };
  }

  const policyError = validateAdminPassword(newPassword);
  if (policyError) {
    return { ok: false, message: policyError };
  }

  const validation = await validateAdminResetToken(args.token);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const passwordHash = hashPassword(newPassword);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(adminUsers)
      .set({
        passwordHash,
        mustChangePassword: false,
        updatedAt: now,
      })
      .where(eq(adminUsers.id, validation.adminId));

    await tx
      .update(adminPasswordResetTokens)
      .set({ consumedAt: now })
      .where(eq(adminPasswordResetTokens.id, validation.tokenId));
  });

  return { ok: true };
}
