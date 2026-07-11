/**
 * Resolves the Capital database URL from environment variables.
 * Supports Vercel Neon integration naming (INVEST_DATABASE_DATABASE_URL) and
 * the canonical INVEST_DATABASE_URL.
 */
const INVEST_DATABASE_ENV_KEYS = [
  'INVEST_DATABASE_URL',
  'INVEST_DATABASE_DATABASE_URL',
  'INVEST_POSTGRES_URL',
  'INVEST_POSTGRES_PRISMA_URL',
] as const;

export function resolveInvestDatabaseUrl(): string | undefined {
  for (const key of INVEST_DATABASE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getInvestDatabaseUrl(): string {
  const url = resolveInvestDatabaseUrl();
  if (!url) {
    throw new Error(
      'INVEST_DATABASE_URL is not set.\n' +
        'Create a Neon database and add INVEST_DATABASE_URL (or INVEST_DATABASE_DATABASE_URL from Vercel Neon integration) to your environment.',
    );
  }
  return url;
}

export function hasInvestDatabaseUrl(): boolean {
  return Boolean(resolveInvestDatabaseUrl());
}

export function assertInvestDatabaseIsolated(): void {
  const invest = resolveInvestDatabaseUrl();
  const pg = process.env.DATABASE_URL?.trim();
  if (invest && pg && invest === pg) {
    throw new Error('INVEST_DATABASE_URL must not equal DATABASE_URL — Capital and PG require separate databases.');
  }
}

export function getInvestDatabaseHost(): string | null {
  try {
    const url = getInvestDatabaseUrl().replace(/^postgres:/, 'postgresql:');
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
