import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import {
  databaseUrlHost,
  parseDatabaseUrl,
  resolveDatabaseUrl,
  resolveDatabaseUrlSource,
} from '@/src/lib/db/connectionOptions';
import * as schema from './schema';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

type DbGlobal = {
  sql?: Sql;
  drizzle?: DrizzleClient;
  /** Throttle pg_stat_activity logging in dev. */
  lastStatsLog?: number;
};

const GLOBAL_KEY = '__awesomepgDb' as const;

function dbGlobal(): DbGlobal {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DbGlobal };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = {};
  return g[GLOBAL_KEY];
}


async function logConnectionStats(sql: Sql, label: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const [row] = await sql<{ total: number; app: number }[]>`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE application_name LIKE 'awesomepg%')::int AS app
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    console.info(
      `[db] ${label}: connections total=${row?.total ?? '?'} awesomepg=${row?.app ?? '?'}`,
    );
  } catch {
    // Stats are best-effort in dev.
  }
}

function maybeLogPeriodicStats(sql: Sql): void {
  if (process.env.NODE_ENV === 'production') return;
  const global = dbGlobal();
  const now = Date.now();
  if (global.lastStatsLog && now - global.lastStatsLog < 60_000) return;
  global.lastStatsLog = now;
  void logConnectionStats(sql, 'periodic');
}

function init(): DrizzleClient {
  const global = dbGlobal();
  if (global.drizzle) return global.drizzle;

  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      'Database connection string is not set. Set DATABASE_URL (or POSTGRES_URL from ' +
        'Neon/Vercel integration) in environment variables — see DATABASE_SETUP.md.',
    );
  }

  const { connectionString, options } = parseDatabaseUrl(url);
  const sql = postgres(connectionString, options);

  global.sql = sql;
  global.drizzle = drizzle(sql, { schema, casing: 'snake_case' });

  if (process.env.VERCEL) {
    console.log('[db] pool opened', {
      source: resolveDatabaseUrlSource(),
      host: databaseUrlHost(url),
      max: options.max ?? '?',
    });
  }

  void logConnectionStats(sql, `pool opened (max=${options.max ?? '?'})`);

  return global.drizzle;
}

/**
 * Lazy singleton backed by `globalThis` so Next.js dev hot-reload reuses one
 * pool per Node process instead of leaking a new postgres.js pool on every
 * module re-evaluation.
 */
export const db: DrizzleClient = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    const client = init();
    const global = dbGlobal();
    if (global.sql) maybeLogPeriodicStats(global.sql);
    return Reflect.get(client as object, prop, receiver);
  },
});

export type Database = DrizzleClient;
export { schema };

/**
 * Helper for scripts (migrate, seed, reset) that want a short-lived
 * connection with explicit close semantics. Pages should use the lazy `db`
 * export above instead.
 */
export function createClient(options?: { max?: number }) {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      'Database connection string is not set (DATABASE_URL or POSTGRES_URL). See DATABASE_SETUP.md.',
    );
  }
  const parsed = parseDatabaseUrl(url);
  const client = postgres(parsed.connectionString, {
    ...parsed.options,
    max: options?.max ?? 1,
    connection: { application_name: 'awesomepg-script' },
  });
  return {
    db: drizzle(client, { schema, casing: 'snake_case' }),
    sql: client,
    close: () => client.end({ timeout: 5 }),
  };
}

/**
 * Close the lazy singleton (if it was initialised). Intended for one-off
 * scripts so their Node process can exit cleanly after the work is done.
 * Safe to call multiple times.
 */
export async function closeDb(): Promise<void> {
  const global = dbGlobal();
  if (global.sql) {
    const handle = global.sql;
    global.sql = undefined;
    global.drizzle = undefined;
    await handle.end({ timeout: 5 });
  }
}

/** Dev helper — current Postgres connection counts for this database. */
export async function getConnectionStats(): Promise<{ total: number; app: number } | null> {
  const global = dbGlobal();
  if (!global.sql) return null;
  try {
    const [row] = await global.sql<{ total: number; app: number }[]>`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE application_name LIKE 'awesomepg%')::int AS app
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return row ?? null;
  } catch {
    return null;
  }
}
