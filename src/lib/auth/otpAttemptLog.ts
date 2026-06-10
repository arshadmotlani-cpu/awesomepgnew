import { db } from '@/src/db/client';
import { emailOtpAttemptLog } from '@/src/db/schema';

export type OtpAttemptAction = 'send' | 'verify_success' | 'verify_fail';

export async function logOtpAttempt(args: {
  email: string;
  action: OtpAttemptAction;
  success: boolean;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await db.insert(emailOtpAttemptLog).values({
    email: args.email,
    action: args.action,
    success: args.success,
    reason: args.reason ?? null,
    ip: args.ip ?? null,
    userAgent: args.userAgent ?? null,
  });
}
