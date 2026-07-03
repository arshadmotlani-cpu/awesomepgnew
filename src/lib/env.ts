import { getDatabaseUrl, hasDatabaseUrl } from '@/src/lib/db/env';
import { checkRequiredEnv, getEnvHealthSummary } from '@/src/lib/healing/envHealer';
import { isDegradedMode, isSafeMode } from '@/src/lib/healing/systemState';

export { checkRequiredEnv, getEnvHealthSummary, isDegradedMode, isSafeMode };

/** True when DATABASE_URL or Neon/Vercel Postgres vars are configured. */
export function isDatabaseConfigured(): boolean {
  return hasDatabaseUrl();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : undefined;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

type PaymentProvider = 'mock' | 'razorpay';

function paymentProvider(): PaymentProvider {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const fallback = isProd ? '' : 'mock';
  const raw = (process.env.PAYMENT_PROVIDER ?? fallback).toLowerCase();
  if (!raw) {
    throw new Error('PAYMENT_PROVIDER is required in production (use razorpay).');
  }
  if (raw !== 'mock' && raw !== 'razorpay') {
    throw new Error(
      `PAYMENT_PROVIDER must be "mock" or "razorpay", got "${process.env.PAYMENT_PROVIDER}"`,
    );
  }
  if (isProd && raw === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock is not allowed in production.');
  }
  return raw as PaymentProvider;
}

/**
 * Lazy accessors. Reading these as plain object properties would force every
 * module import to validate every variable at load time — that breaks the
 * unit tests for `cancellationPolicy.ts` which don't need any DB or payment
 * env. Each entry is evaluated only when read.
 */
export const env = {
  get DATABASE_URL() {
    if (!hasDatabaseUrl()) {
      throw new Error(
        'Database URL not configured (DATABASE_URL / POSTGRES_URL). System is in degraded mode.',
      );
    }
    return getDatabaseUrl();
  },
  get DATABASE_POOL_MAX() {
    return optionalInt('DATABASE_POOL_MAX', 10);
  },

  // ── Phase 4 — Payments ────────────────────────────────────────────────
  /** "mock" (default everywhere) or "razorpay" (explicit opt-in only). */
  get PAYMENT_PROVIDER() {
    return paymentProvider();
  },
  /** How long a `hold` reservation survives before the sweeper kills it. */
  get BOOKING_HOLD_MINUTES() {
    return optionalInt('BOOKING_HOLD_MINUTES', 15);
  },
  /** How long admin has to review a submitted booking payment proof. */
  get BOOKING_PROOF_REVIEW_DAYS() {
    return optionalInt('BOOKING_PROOF_REVIEW_DAYS', 7);
  },
  /** Grace window after booking proof rejection before reservation expires. */
  get BOOKING_REJECT_GRACE_MINUTES() {
    return optionalInt('BOOKING_REJECT_GRACE_MINUTES', 60);
  },
  /** Razorpay credentials. Only required when PAYMENT_PROVIDER=razorpay. */
  get RAZORPAY_KEY_ID() {
    return optional('RAZORPAY_KEY_ID');
  },
  get RAZORPAY_KEY_SECRET() {
    return optional('RAZORPAY_KEY_SECRET');
  },
  get RAZORPAY_WEBHOOK_SECRET() {
    return optional('RAZORPAY_WEBHOOK_SECRET');
  },
  /** Shared secret expected as `Authorization: Bearer <secret>` on cron routes. */
  get CRON_SECRET() {
    return optional('CRON_SECRET');
  },
  /** Dev/CI only — HMAC secret for /api/webhooks/mock (min 16 chars). */
  get MOCK_WEBHOOK_SECRET() {
    return optional('MOCK_WEBHOOK_SECRET');
  },

  // ── Phase 6 — Authentication ────────────────────────────────────────────
  get NODE_ENV() {
    return process.env.NODE_ENV ?? 'development';
  },
  /** Used for session cookie secure flag and OTP mock default. */
  get AUTH_SECRET() {
    return optional('AUTH_SECRET') ?? 'dev-only-auth-secret-change-me';
  },
  get AUTH_CUSTOMER_SESSION_DAYS() {
    return optionalInt('AUTH_CUSTOMER_SESSION_DAYS', 7);
  },
  /** Standard admin session length (without Remember Me). Default 30 days. */
  get AUTH_ADMIN_SESSION_DAYS() {
    return optionalInt('AUTH_ADMIN_SESSION_DAYS', 30);
  },
  /** Remember Me admin session length. Default 365 days. */
  get AUTH_ADMIN_REMEMBER_DAYS() {
    return optionalInt('AUTH_ADMIN_REMEMBER_DAYS', 365);
  },
  /** Extend admin session when remaining lifetime falls below this threshold. Default 7 days. */
  get AUTH_ADMIN_SESSION_REFRESH_DAYS() {
    return optionalInt('AUTH_ADMIN_SESSION_REFRESH_DAYS', 7);
  },
  /** @deprecated Use AUTH_ADMIN_SESSION_DAYS. Kept for backward compatibility. */
  get AUTH_ADMIN_SESSION_HOURS() {
    const days = optionalInt('AUTH_ADMIN_SESSION_DAYS', 0);
    if (days > 0) return days * 24;
    return optionalInt('AUTH_ADMIN_SESSION_HOURS', 24 * 30);
  },
  /** Password reset link validity (minutes). Default 60. */
  get AUTH_ADMIN_RESET_TOKEN_MINUTES() {
    return optionalInt('AUTH_ADMIN_RESET_TOKEN_MINUTES', 60);
  },
  /** Minimum seconds between admin password reset email sends. Default 60. */
  get AUTH_ADMIN_RESET_RESEND_SECONDS() {
    return optionalInt('AUTH_ADMIN_RESET_RESEND_SECONDS', 60);
  },
  /** Max password reset emails per hour (per admin account). Default 5. */
  get AUTH_ADMIN_RESET_MAX_PER_HOUR() {
    return optionalInt('AUTH_ADMIN_RESET_MAX_PER_HOUR', 5);
  },
  /** One-time bootstrap password for first admin account on deploy. */
  get ADMIN_INITIAL_PASSWORD() {
    return optional('ADMIN_INITIAL_PASSWORD');
  },
  /** Receives admin password reset links (forgot-password flow). */
  get ADMIN_RECOVERY_EMAIL() {
    return optional('ADMIN_RECOVERY_EMAIL');
  },
  /** OTP validity window (minutes). Default 5. */
  get AUTH_OTP_TTL_MINUTES() {
    return optionalInt('AUTH_OTP_TTL_MINUTES', 5);
  },
  /** Minimum seconds between OTP resend requests for the same number. Default 30. */
  get AUTH_OTP_RESEND_SECONDS() {
    return optionalInt('AUTH_OTP_RESEND_SECONDS', 30);
  },
  /** Max successful OTP sends per email per rolling hour. */
  get AUTH_OTP_MAX_SENDS_PER_HOUR() {
    return optionalInt('AUTH_OTP_MAX_SENDS_PER_HOUR', 5);
  },
  /** Max OTP send attempts per client IP per rolling hour. */
  get AUTH_OTP_MAX_SENDS_PER_IP_HOUR() {
    return optionalInt('AUTH_OTP_MAX_SENDS_PER_IP_HOUR', 15);
  },
  /** Resident developer test mode — only this email receives workflow bypass + dev tools. */
  get DEVELOPER_TEST_EMAIL() {
    return optional('DEVELOPER_TEST_EMAIL');
  },

  // ── Email (Resend preferred, SMTP fallback) ───────────────────────────────
  get RESEND_API_KEY() {
    return optional('RESEND_API_KEY');
  },
  /** From address, e.g. "Awesome PG <noreply@awesomepg.com>" */
  get EMAIL_FROM() {
    return optional('EMAIL_FROM');
  },
  get SMTP_HOST() {
    return optional('SMTP_HOST');
  },
  get SMTP_PORT() {
    return optionalInt('SMTP_PORT', 587);
  },
  get SMTP_USER() {
    return optional('SMTP_USER');
  },
  get SMTP_PASS() {
    return optional('SMTP_PASS');
  },
  /** Receives a copy of every tenant notification email (BCC). */
  get ADMIN_NOTIFICATION_EMAIL() {
    return optional('ADMIN_NOTIFICATION_EMAIL');
  },

  /** Set to "false" to hide the Cockroach AI guide on customer pages. */
  get COCKROACH_AI_ENABLED() {
    return process.env.COCKROACH_AI_ENABLED !== 'false';
  },

  // ── Analytics & observability ─────────────────────────────────────────────
  get NEXT_PUBLIC_POSTHOG_KEY() {
    return optional('NEXT_PUBLIC_POSTHOG_KEY');
  },
  get NEXT_PUBLIC_POSTHOG_HOST() {
    return optional('NEXT_PUBLIC_POSTHOG_HOST') ?? 'https://us.i.posthog.com';
  },
  get NEXT_PUBLIC_SENTRY_DSN() {
    return optional('NEXT_PUBLIC_SENTRY_DSN');
  },
  get SENTRY_ORG() {
    return optional('SENTRY_ORG');
  },
  get SENTRY_PROJECT() {
    return optional('SENTRY_PROJECT');
  },

  // ── Web Push (PWA) ───────────────────────────────────────────────────
  get VAPID_PUBLIC_KEY() {
    return optional('VAPID_PUBLIC_KEY');
  },
  get VAPID_PRIVATE_KEY() {
    return optional('VAPID_PRIVATE_KEY');
  },
  get NEXT_PUBLIC_VAPID_PUBLIC_KEY() {
    return optional('NEXT_PUBLIC_VAPID_PUBLIC_KEY') ?? optional('VAPID_PUBLIC_KEY');
  },
  get VAPID_SUBJECT() {
    return optional('VAPID_SUBJECT') ?? 'mailto:admin@awesomepg.com';
  },

  /** IANA timezone for rent billing anniversary (default Asia/Kolkata). */
  get BILLING_TIMEZONE() {
    return optional('BILLING_TIMEZONE') ?? 'Asia/Kolkata';
  },
} as const;

export type Env = typeof env;
export type { PaymentProvider };
