export type DatabaseEnvSource = 'DATABASE_URL' | 'POSTGRES_URL' | 'POSTGRES_PRISMA_URL';

const DATABASE_ENV_KEYS: DatabaseEnvSource[] = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
];

function readEnv(key: DatabaseEnvSource): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

type EnvPresence = 'Missing' | 'Found' | 'Empty (not exported)';

function envPresence(key: DatabaseEnvSource): EnvPresence {
  if (!(key in process.env)) return 'Missing';
  const value = process.env[key]?.trim();
  if (!value) return 'Empty (not exported)';
  return 'Found';
}

/** Human-readable report when database configuration is missing or ambiguous. */
export function formatDatabaseConfigReport(): string {
  const lines = [
    'DATABASE CONFIGURATION',
    `  DATABASE_URL .......... ${envPresence('DATABASE_URL')}`,
    `  POSTGRES_URL .......... ${envPresence('POSTGRES_URL')}`,
    `  POSTGRES_PRISMA_URL ... ${envPresence('POSTGRES_PRISMA_URL')}`,
  ];

  const source = getDatabaseUrlSource();
  if (source) {
    lines.push(`Using: ${source}`);
    const host = getDatabaseHost();
    if (host) lines.push(`Host: ${host}`);
  } else {
    lines.push('');
    lines.push('No usable database URL found.');
    lines.push('');
    if (
      envPresence('DATABASE_URL') === 'Empty (not exported)' ||
      envPresence('POSTGRES_URL') === 'Empty (not exported)'
    ) {
      lines.push('Keys exist in .env.local but values are empty.');
      lines.push('Neon/Vercel integration secrets are injected at deploy time and');
      lines.push('cannot be exported via `vercel env pull`.');
      lines.push('');
      lines.push('Fix (pick one):');
      lines.push('  1. Neon dashboard → Connection string → paste into .env.local as DATABASE_URL');
      lines.push('  2. Local Postgres: copy DATABASE_URL from .env.example');
      lines.push('  3. Vercel dashboard → add non-sensitive DATABASE_URL to Development env');
    } else {
      lines.push('Local setup:');
      lines.push('  npx vercel link');
      lines.push('  npm run env:pull');
      lines.push('  # then set DATABASE_URL in .env.local if pull values are empty');
    }
    lines.push('  npm run db:migrate');
  }

  return lines.join('\n');
}

/** Unified resolver — priority: DATABASE_URL → POSTGRES_URL → POSTGRES_PRISMA_URL. */
export function getDatabaseUrl(): string {
  const url =
    readEnv('DATABASE_URL') ||
    readEnv('POSTGRES_URL') ||
    readEnv('POSTGRES_PRISMA_URL');

  if (!url) {
    throw new Error(formatDatabaseConfigReport());
  }

  return url;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(
    readEnv('DATABASE_URL') || readEnv('POSTGRES_URL') || readEnv('POSTGRES_PRISMA_URL'),
  );
}

export function getDatabaseUrlSource(): DatabaseEnvSource | null {
  for (const key of DATABASE_ENV_KEYS) {
    if (readEnv(key)) return key;
  }
  return null;
}

export type DatabaseConnectionInfo = {
  source: DatabaseEnvSource;
  host: string;
  database: string;
  environment: string;
  isLocalhost: boolean;
};

/** Parsed connection metadata — safe for logs (no credentials). */
export function getDatabaseConnectionInfo(): DatabaseConnectionInfo {
  const url = getDatabaseUrl();
  const source = getDatabaseUrlSource() ?? 'DATABASE_URL';
  const normalized = url.replace(/^postgres:/, 'postgresql:');
  let host = 'unknown';
  let database = 'unknown';
  try {
    const parsed = new URL(normalized);
    host = parsed.hostname || 'unknown';
    database = parsed.pathname.replace(/^\//, '') || 'unknown';
  } catch {
    // keep defaults
  }

  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const environment =
    process.env.VERCEL_ENV ??
    (process.env.VERCEL === '1' ? 'vercel' : process.env.NODE_ENV ?? 'development');

  return { source, host, database, environment, isLocalhost };
}

/** Hostname only — safe for logs (no credentials). */
export function getDatabaseHost(): string | null {
  try {
    return getDatabaseConnectionInfo().host;
  } catch {
    return null;
  }
}

/** Non-throwing env snapshot for health checks and ops. */
export function getDatabaseEnvStatus() {
  return {
    hasDatabaseUrl: hasDatabaseUrl(),
    databaseUrlSet: Boolean(readEnv('DATABASE_URL')),
    postgresUrlSet: Boolean(readEnv('POSTGRES_URL')),
    postgresPrismaUrlSet: Boolean(readEnv('POSTGRES_PRISMA_URL')),
    source: getDatabaseUrlSource(),
    host: getDatabaseHost(),
  };
}
