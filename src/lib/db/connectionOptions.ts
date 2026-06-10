import type { Options } from 'postgres';
import {
  getDatabaseHost,
  getDatabaseUrl,
  getDatabaseUrlSource,
  type DatabaseEnvSource,
} from './env';

export type DatabaseUrlSource = DatabaseEnvSource;

/** @deprecated Use getDatabaseUrl() from ./env — kept for existing imports. */
export function resolveDatabaseUrl(): string {
  return getDatabaseUrl();
}

/** @deprecated Use getDatabaseUrlSource() from ./env — kept for existing imports. */
export function resolveDatabaseUrlSource(): DatabaseUrlSource | null {
  return getDatabaseUrlSource();
}

/** @deprecated Use getDatabaseHost() from ./env — kept for existing imports. */
export function databaseUrlHost(): string | null {
  return getDatabaseHost();
}

/**
 * Serverless-friendly postgres.js options for Vercel + managed Postgres
 * (Neon, Supabase, Vercel Postgres, RDS).
 */
export function parseDatabaseUrl(url: string): {
  connectionString: string;
  options: Options<Record<string, never>>;
} {
  const isVercel = Boolean(process.env.VERCEL);
  const isProduction = process.env.NODE_ENV === 'production';

  const needsSsl =
    /sslmode=(require|verify-full|verify-ca|no-verify)/i.test(url) ||
    (/@(localhost|127\.0\.0\.1)(:|\/)/i.test(url) === false &&
      /neon\.tech|supabase\.co|vercel-storage\.com|aws\.amazonaws\.com|rds\.amazonaws|render\.com|railway\.app|elephantsql\.com/i.test(
        url,
      ));

  const poolMax = (() => {
    const raw = process.env.DATABASE_POOL_MAX;
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    if (isVercel) return 1;
    return isProduction ? 3 : 3;
  })();

  const options: Options<Record<string, never>> = {
    max: poolMax,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    connection: {
      application_name: `awesomepg-${process.env.NODE_ENV ?? 'development'}`,
    },
  };

  if (needsSsl) {
    options.ssl = 'require';
  }

  return { connectionString: url, options };
}

export function classifyDatabaseError(message: string): {
  code: 'missing_url' | 'connection' | 'schema' | 'auth' | 'unknown';
  hint: string;
} {
  if (/DATABASE URL missing|DATABASE URL not found|DATABASE_URL|POSTGRES_URL/i.test(message)) {
    return {
      code: 'missing_url',
      hint:
        'Set DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL from Neon/Vercel integration) ' +
        'in Vercel → Project → Settings → Environment Variables.',
    };
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|Connection terminated/i.test(message)) {
    return {
      code: 'connection',
      hint: 'Check DATABASE_URL host, SSL, and that the database accepts connections from Vercel.',
    };
  }
  if (/password authentication failed|28P01/i.test(message)) {
    return {
      code: 'auth',
      hint: 'DATABASE_URL username or password is incorrect.',
    };
  }
  if (/relation .* does not exist|drizzle\.__drizzle_migrations|42P01/i.test(message)) {
    return {
      code: 'schema',
      hint: 'Run migrations: npm run db:migrate (with production DATABASE_URL), then npm run db:seed.',
    };
  }
  return {
    code: 'unknown',
    hint: 'Check Vercel function logs for the full database error.',
  };
}
