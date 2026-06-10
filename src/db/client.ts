import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { parseDatabaseUrl } from '@/src/lib/db/connectionOptions';
import { getDatabaseUrl } from '@/src/lib/db/env';
import { monitoringDrizzleLogger } from '@/src/lib/monitoring/drizzleLogger';
import * as schema from './schema';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

type DbGlobal = {
  sql?: Sql;
  drizzle?: DrizzleClient;
};

const GLOBAL_KEY = '__awesomepgDb' as const;

function dbGlobal(): DbGlobal {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DbGlobal };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = {};
  return g[GLOBAL_KEY];
}

function init(): DrizzleClient {
  const global = dbGlobal();
  if (global.drizzle) return global.drizzle;

  const url = getDatabaseUrl();
  const { connectionString, options } = parseDatabaseUrl(url);
  const sql = postgres(connectionString, options);

  global.sql = sql;
  global.drizzle = drizzle(sql, {
    schema,
    casing: 'snake_case',
    logger: monitoringDrizzleLogger,
  });

  return global.drizzle;
}

/**
 * Lazy singleton backed by `globalThis` so Next.js dev hot-reload reuses one
 * pool per Node process instead of leaking a new postgres.js pool on every
 * module re-evaluation. Connection is opened on first query, not at import.
 */
export const db: DrizzleClient = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    const client = init();
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
  const url = getDatabaseUrl();
  const parsed = parseDatabaseUrl(url);
  const client = postgres(parsed.connectionString, {
    ...parsed.options,
    max: options?.max ?? 1,
    connection: { application_name: 'awesomepg-script' },
  });
  return {
    db: drizzle(client, { schema, casing: 'snake_case', logger: monitoringDrizzleLogger }),
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
