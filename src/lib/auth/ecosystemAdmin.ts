/**
 * Ecosystem-wide admin bootstrap credentials (email only in source).
 * Password must come from env — never commit ECOSYSTEM_ADMIN_PASSWORD.
 */
export const ECOSYSTEM_ADMIN_EMAIL = 'admin@foryour.co';

/** Prior PG seed / bootstrap emails — upsert migrates these rows only. */
export const LEGACY_PG_ADMIN_EMAILS = [
  'admin@awesomepg.local',
  'admin@foryour.in',
] as const;

export const LEGACY_HAIR_ADMIN_EMAILS = ['admin@fyhair.local'] as const;

export const LEGACY_OWNER_ADMIN_EMAILS = ['owner@awesomepg.in'] as const;

const PASSWORD_ENV_KEYS = [
  'ECOSYSTEM_ADMIN_PASSWORD',
  'ADMIN_INITIAL_PASSWORD',
  'HAIR_ADMIN_PASSWORD',
  'INVEST_ADMIN_PASSWORD',
  'OWNER_ADMIN_PASSWORD',
] as const;

export function resolveEcosystemAdminEmail(): string {
  const fromEnv =
    process.env.ECOSYSTEM_ADMIN_EMAIL?.trim().toLowerCase() ||
    process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return fromEnv || ECOSYSTEM_ADMIN_EMAIL;
}

/** Returns password from env chain, or null when unset (seed/upsert should skip). */
export function resolveEcosystemAdminPassword(): string | null {
  for (const key of PASSWORD_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}
