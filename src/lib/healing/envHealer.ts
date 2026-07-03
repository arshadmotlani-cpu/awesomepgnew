import { hasDatabaseUrl } from '@/src/lib/db/env';
import { getIntegrationsHealthSummary } from '@/src/lib/integrations/status';
import { isPushConfigured } from '@/src/lib/push/webPush';
import { isBlobPrivateConfigured } from '@/src/lib/storage/blob';
import { logger } from '@/src/lib/logger';
import { patchSystemState } from '@/src/lib/healing/systemState';

export type EnvCheckResult = {
  ok: boolean;
  missing: string[];
  degradedFeatures: string[];
};

function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/** True only on the live Vercel production deployment — not preview, CI, or local prod builds. */
function isVercelProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

function hasAuthSecret(): boolean {
  const v = process.env.AUTH_SECRET?.trim();
  if (!v) return false;
  return v !== 'dev-only-auth-secret-change-me';
}

function hasBaseUrl(): boolean {
  // getAppUrl() always resolves (production canonical, preview VERCEL_URL, dev localhost).
  return true;
}

/** Non-throwing runtime env validation — never crashes the app. */
export function checkRequiredEnv(): EnvCheckResult {
  const missing: string[] = [];
  const degradedFeatures: string[] = [];

  if (!hasDatabaseUrl()) {
    missing.push('DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL');
    degradedFeatures.push('database', 'bookings', 'admin-data');
  }

  if (isProduction() && !hasAuthSecret()) {
    missing.push('AUTH_SECRET');
    degradedFeatures.push('auth-sessions');
  }

  const ok = missing.length === 0;

  if (!ok) {
    patchSystemState({
      envStatus: 'degraded',
      degradedMode: true,
      lastError: `Missing env: ${missing.join(', ')}`,
    });
    try {
      logger.warn('env self-heal: degraded mode', { missing, degradedFeatures });
    } catch {
      // ignore logging failures
    }
  } else {
    patchSystemState({ envStatus: 'ok' });
  }

  return { ok, missing, degradedFeatures };
}

/** Throws on Vercel production when critical secrets or payment config are missing or insecure. */
export function assertProductionBootSecrets(): void {
  if (!isVercelProductionDeployment()) return;

  const missing: string[] = [];

  if (!hasAuthSecret()) missing.push('AUTH_SECRET');
  if (!process.env.CRON_SECRET?.trim()) missing.push('CRON_SECRET');

  if (!isBlobPrivateConfigured()) {
    missing.push('BLOB_READ_WRITE_TOKEN (private blob)');
  }

  const provider = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'mock') {
    missing.push('PAYMENT_PROVIDER must not be mock in production');
  } else if (provider === 'razorpay') {
    if (!process.env.RAZORPAY_KEY_ID?.trim()) missing.push('RAZORPAY_KEY_ID');
    if (!process.env.RAZORPAY_KEY_SECRET?.trim()) missing.push('RAZORPAY_KEY_SECRET');
    if (!process.env.RAZORPAY_WEBHOOK_SECRET?.trim()) missing.push('RAZORPAY_WEBHOOK_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(`Production boot blocked — fix environment: ${missing.join('; ')}`);
  }
}

export function getEnvHealthSummary() {
  const check = checkRequiredEnv();
  const integrations = getIntegrationsHealthSummary();
  return {
    ok: check.ok,
    missing: check.missing,
    degradedFeatures: check.degradedFeatures,
    databaseConfigured: hasDatabaseUrl(),
    authConfigured: hasAuthSecret() || !isProduction(),
    baseUrlConfigured: hasBaseUrl(),
    blobPrivateConfigured: integrations.blob.privateConfigured,
    blobPublicConfigured: integrations.blob.publicConfigured,
    kycUploadsAvailable: integrations.kyc.uploadsAvailable,
    pushConfigured: isPushConfigured(),
    integrations,
  };
}
