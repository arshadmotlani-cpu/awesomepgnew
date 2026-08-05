/**
 * OWNER_DATABASE_URL must be a dedicated Neon DB — never PG / Hair / Capital.
 * Supports Vercel Neon integration naming (OWNER_DATABASE_POSTGRES_URL) and
 * the canonical OWNER_DATABASE_URL.
 */
const OWNER_DATABASE_ENV_KEYS = [
  'OWNER_DATABASE_URL',
  'OWNER_DATABASE_DATABASE_URL',
  'OWNER_DATABASE_POSTGRES_URL',
  'OWNER_DATABASE_POSTGRES_PRISMA_URL',
  'OWNER_POSTGRES_URL',
] as const;

export function resolveOwnerDatabaseUrl(): string | undefined {
  for (const key of OWNER_DATABASE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getOwnerDatabaseUrl(): string {
  const url = resolveOwnerDatabaseUrl();
  if (!url) {
    throw new Error(
      'OWNER_DATABASE_URL is not set.\n' +
        'Create a Neon database and add OWNER_DATABASE_URL for Owner OS.',
    );
  }
  return url;
}

export function hasOwnerDatabaseUrl(): boolean {
  return Boolean(resolveOwnerDatabaseUrl());
}

export function assertOwnerDatabaseIsolated(): void {
  const owner = resolveOwnerDatabaseUrl();
  const pg = process.env.DATABASE_URL?.trim();
  const invest = process.env.INVEST_DATABASE_URL?.trim();
  const hair = process.env.HAIR_DATABASE_URL?.trim();
  if (owner && pg && owner === pg) {
    throw new Error('OWNER_DATABASE_URL must not equal DATABASE_URL');
  }
  if (owner && invest && owner === invest) {
    throw new Error('OWNER_DATABASE_URL must not equal INVEST_DATABASE_URL');
  }
  if (owner && hair && owner === hair) {
    throw new Error('OWNER_DATABASE_URL must not equal HAIR_DATABASE_URL');
  }
}

export function getOwnerDatabaseHost(): string | null {
  try {
    const url = getOwnerDatabaseUrl().replace(/^postgres:/, 'postgresql:');
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
