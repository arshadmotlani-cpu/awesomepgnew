import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { parseDatabaseUrl } from '@/src/lib/db/connectionOptions';
import { getHairDatabaseUrl, assertHairDatabaseIsolated } from '@/src/hair/lib/db/env';
import * as schema from '@/src/hair/db/schema';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

type DbGlobal = { sql?: Sql; drizzle?: DrizzleClient };
const GLOBAL_KEY = '__hairDb' as const;

function dbGlobal(): DbGlobal {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DbGlobal };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = {};
  return g[GLOBAL_KEY];
}

function init(): DrizzleClient {
  const global = dbGlobal();
  if (global.drizzle) return global.drizzle;

  const url = getHairDatabaseUrl();
  assertHairDatabaseIsolated();
  const { connectionString, options } = parseDatabaseUrl(url);
  const sql = postgres(connectionString, {
    ...options,
    connection: { application_name: `hair-${process.env.NODE_ENV ?? 'development'}` },
  });

  global.sql = sql;
  global.drizzle = drizzle(sql, { schema, casing: 'snake_case' });
  return global.drizzle;
}

export const hairDb: DrizzleClient = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    return Reflect.get(init() as object, prop, receiver);
  },
});

export function createHairClient(options?: { max?: number }) {
  const url = getHairDatabaseUrl();
  const parsed = parseDatabaseUrl(url);
  const client = postgres(parsed.connectionString, {
    ...parsed.options,
    max: options?.max ?? 1,
    connection: { application_name: 'hair-script' },
  });
  return {
    db: drizzle(client, { schema, casing: 'snake_case' }),
    sql: client,
    close: () => client.end({ timeout: 5 }),
  };
}

export async function closeHairDb(): Promise<void> {
  const global = dbGlobal();
  if (global.sql) {
    const handle = global.sql;
    global.sql = undefined;
    global.drizzle = undefined;
    await handle.end({ timeout: 5 });
  }
}

export { schema };
