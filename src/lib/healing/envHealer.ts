import { hasDatabaseUrl } from '@/src/lib/db/env';
import { logger } from '@/src/lib/logger';
import { patchSystemState } from '@/src/lib/healing/systemState';

export type EnvCheckResult = {
  ok: boolean;
  missing: string[];
  degradedFeatures: string[];
};

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function hasAuthSecret(): boolean {
  const v = process.env.AUTH_SECRET?.trim();
  if (!v) return false;
  return v !== 'dev-only-auth-secret-change-me';
}

function hasBaseUrl(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
      process.env.VERCEL_URL?.trim() ||
      process.env.NEXT_PUBLIC_VERCEL_URL?.trim(),
  );
}

/** Non-throwing runtime env validation — never crashes the app. */
export function checkRequiredEnv(): EnvCheckResult {
  const missing: string[] = [];
  const degradedFeatures: string[] = [];

  if (!hasDatabaseUrl()) {
    missing.push('DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL');
    degradedFeatures.push('database', 'bookings', 'admin-data');
  }

  if (!hasBaseUrl()) {
    missing.push('NEXT_PUBLIC_BASE_URL');
    degradedFeatures.push('absolute-links', 'email-callbacks');
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

export function getEnvHealthSummary() {
  const check = checkRequiredEnv();
  return {
    ok: check.ok,
    missing: check.missing,
    degradedFeatures: check.degradedFeatures,
    databaseConfigured: hasDatabaseUrl(),
    authConfigured: hasAuthSecret() || !isProduction(),
    baseUrlConfigured: hasBaseUrl(),
  };
}
