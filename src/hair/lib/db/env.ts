/**
 * Resolves the For Your Hair database URL from environment variables.
 * Supports Vercel Neon integration naming and the canonical HAIR_DATABASE_URL.
 */
const HAIR_DATABASE_ENV_KEYS = [
  'HAIR_DATABASE_URL',
  'FORYOURHAIR_DATABASE_URL',
  'HAIR_DATABASE_DATABASE_URL',
  'HAIR_POSTGRES_URL',
  'HAIR_POSTGRES_PRISMA_URL',
] as const;

export function resolveHairDatabaseUrl(): string | undefined {
  for (const key of HAIR_DATABASE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getHairDatabaseUrl(): string {
  const url = resolveHairDatabaseUrl();
  if (!url) {
    throw new Error(
      'HAIR_DATABASE_URL is not set.\n' +
        'Create a Neon database and add HAIR_DATABASE_URL (or HAIR_DATABASE_DATABASE_URL from Vercel Neon integration) to your environment.',
    );
  }
  return url;
}

export function hasHairDatabaseUrl(): boolean {
  return Boolean(resolveHairDatabaseUrl());
}

export function assertHairDatabaseIsolated(): void {
  const hair = resolveHairDatabaseUrl();
  const pg = process.env.DATABASE_URL?.trim();
  const invest =
    process.env.INVEST_DATABASE_URL?.trim() ||
    process.env.INVEST_DATABASE_DATABASE_URL?.trim();
  if (hair && pg && hair === pg) {
    throw new Error(
      'HAIR_DATABASE_URL must not equal DATABASE_URL — For Your Hair and PG require separate databases.',
    );
  }
  if (hair && invest && hair === invest) {
    throw new Error(
      'HAIR_DATABASE_URL must not equal INVEST_DATABASE_URL — For Your Hair and Automotive Capital require separate databases.',
    );
  }
  const owner = process.env.OWNER_DATABASE_URL?.trim();
  const platform = process.env.PLATFORM_DATABASE_URL?.trim();
  if (hair && owner && hair === owner) {
    throw new Error('HAIR_DATABASE_URL must not equal OWNER_DATABASE_URL');
  }
  if (hair && platform && hair === platform) {
    throw new Error('HAIR_DATABASE_URL must not equal PLATFORM_DATABASE_URL');
  }
}

export function getHairDatabaseHost(): string | null {
  try {
    const url = getHairDatabaseUrl().replace(/^postgres:/, 'postgresql:');
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
