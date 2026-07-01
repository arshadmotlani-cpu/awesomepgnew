export type PostgresErrorDetails = {
  code: string | null;
  message: string;
  detail: string | null;
  constraint: string | null;
  column: string | null;
  table: string | null;
};

type PgErrorLike = {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  constraint?: unknown;
  constraint_name?: unknown;
  column?: unknown;
  column_name?: unknown;
  table?: unknown;
  table_name?: unknown;
  cause?: unknown;
};

function asPgErrorLike(err: unknown): PgErrorLike | null {
  if (!err || typeof err !== 'object') return null;
  return err as PgErrorLike;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Unwrap Drizzle / postgres-js errors and read SQLSTATE + detail fields. */
export function extractPostgresError(err: unknown): PostgresErrorDetails {
  const layers: PgErrorLike[] = [];
  let current = asPgErrorLike(err);
  while (current) {
    layers.push(current);
    current = asPgErrorLike(current.cause);
  }

  const pg =
    [...layers].reverse().find((layer) => readString(layer.code)?.match(/^[0-9A-Z]{5}$/)) ??
    layers[layers.length - 1];

  const message =
    readString(pg?.message) ??
    (err instanceof Error ? err.message : null) ??
    String(err);

  return {
    code: readString(pg?.code),
    message,
    detail: readString(pg?.detail),
    constraint: readString(pg?.constraint) ?? readString(pg?.constraint_name),
    column: readString(pg?.column) ?? readString(pg?.column_name),
    table: readString(pg?.table) ?? readString(pg?.table_name),
  };
}

/** Human-readable PostgreSQL error for admin surfaces and logs. */
export function formatPostgresError(err: unknown): string {
  const pg = extractPostgresError(err);
  const parts: string[] = [];

  if (pg.code) parts.push(`PostgreSQL ${pg.code}`);
  parts.push(pg.message);
  if (pg.detail) parts.push(pg.detail);
  if (pg.constraint) parts.push(`constraint ${pg.constraint}`);
  if (pg.column) parts.push(`column ${pg.column}`);
  if (pg.table) parts.push(`table ${pg.table}`);

  return parts.join(' — ');
}
