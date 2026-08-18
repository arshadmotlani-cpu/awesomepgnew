/**
 * PLATFORM_DATABASE_URL — dedicated Neon DB for cross-product SaaS identity.
 */
const PLATFORM_DATABASE_ENV_KEYS = [
  'PLATFORM_DATABASE_URL',
  'PLATFORM_DATABASE_DATABASE_URL',
  'PLATFORM_DATABASE_POSTGRES_URL',
  'PLATFORM_DATABASE_POSTGRES_PRISMA_URL',
  'PLATFORM_POSTGRES_URL',
] as const;

export function resolvePlatformDatabaseUrl(): string | undefined {
  for (const key of PLATFORM_DATABASE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getPlatformDatabaseUrl(): string {
  const url = resolvePlatformDatabaseUrl();
  if (!url) {
    throw new Error(
      'PLATFORM_DATABASE_URL is not set.\n' +
        'Create a Neon database and add PLATFORM_DATABASE_URL for Platform SaaS identity.',
    );
  }
  return url;
}

export function hasPlatformDatabaseUrl(): boolean {
  return Boolean(resolvePlatformDatabaseUrl());
}

export function assertPlatformDatabaseIsolated(): void {
  const platform = resolvePlatformDatabaseUrl();
  const pg = process.env.DATABASE_URL?.trim();
  const invest =
    process.env.INVEST_DATABASE_URL?.trim() ||
    process.env.INVEST_DATABASE_DATABASE_URL?.trim();
  const hair = process.env.HAIR_DATABASE_URL?.trim();
  const owner = process.env.OWNER_DATABASE_URL?.trim();
  if (platform && pg && platform === pg) {
    throw new Error('PLATFORM_DATABASE_URL must not equal DATABASE_URL');
  }
  if (platform && invest && platform === invest) {
    throw new Error('PLATFORM_DATABASE_URL must not equal INVEST_DATABASE_URL');
  }
  if (platform && hair && platform === hair) {
    throw new Error('PLATFORM_DATABASE_URL must not equal HAIR_DATABASE_URL');
  }
  if (platform && owner && platform === owner) {
    throw new Error('PLATFORM_DATABASE_URL must not equal OWNER_DATABASE_URL');
  }
}

export function getPlatformDatabaseHost(): string | null {
  try {
    const url = getPlatformDatabaseUrl().replace(/^postgres:/, 'postgresql:');
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
