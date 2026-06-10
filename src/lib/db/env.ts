export type DatabaseEnvSource = 'DATABASE_URL' | 'POSTGRES_PRISMA_URL' | 'POSTGRES_URL';

const DATABASE_ENV_KEYS: DatabaseEnvSource[] = [
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
];

function readEnv(key: DatabaseEnvSource): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

/** Unified resolver — supports Neon, Vercel Postgres, and manual DATABASE_URL. */
export function getDatabaseUrl(): string {
  const url =
    readEnv('DATABASE_URL') ||
    readEnv('POSTGRES_PRISMA_URL') ||
    readEnv('POSTGRES_URL');

  if (!url) {
    throw new Error('❌ DATABASE URL missing in environment variables');
  }

  return url;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(
    readEnv('DATABASE_URL') || readEnv('POSTGRES_PRISMA_URL') || readEnv('POSTGRES_URL'),
  );
}

export function getDatabaseUrlSource(): DatabaseEnvSource | null {
  for (const key of DATABASE_ENV_KEYS) {
    if (readEnv(key)) return key;
  }
  return null;
}

/** Hostname only — safe for logs (no credentials). */
export function getDatabaseHost(): string | null {
  const url =
    readEnv('DATABASE_URL') || readEnv('POSTGRES_PRISMA_URL') || readEnv('POSTGRES_URL');
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    return null;
  }
}

/** Non-throwing env snapshot for health checks and ops. */
export function getDatabaseEnvStatus() {
  return {
    hasDatabaseUrl: hasDatabaseUrl(),
    databaseUrlSet: Boolean(readEnv('DATABASE_URL')),
    postgresPrismaUrlSet: Boolean(readEnv('POSTGRES_PRISMA_URL')),
    postgresUrlSet: Boolean(readEnv('POSTGRES_URL')),
    source: getDatabaseUrlSource(),
    host: getDatabaseHost(),
  };
}
