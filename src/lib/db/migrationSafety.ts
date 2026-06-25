import type { Sql } from 'postgres';
import {
  getDatabaseConnectionInfo,
  type DatabaseConnectionInfo,
} from '@/src/lib/db/env';

export function formatMigrationConnectionBanner(
  info: DatabaseConnectionInfo,
  migrationStats?: { appliedCount: number; latestMigration: string | null },
): string {
  const lines = [
    'Connected Database',
    `  Host .............. ${info.host}`,
    `  Database .......... ${info.database}`,
    `  Environment ....... ${info.environment}`,
    `  Source ............ ${info.source}`,
  ];
  if (migrationStats) {
    lines.push(`  Migration count ... ${migrationStats.appliedCount}`);
    lines.push(
      `  Latest migration .. ${migrationStats.latestMigration ?? '(none applied yet)'}`,
    );
  }
  return lines.join('\n');
}

/**
 * Refuse localhost targets in production / Vercel build contexts so CI never
 * silently migrates an empty local Postgres while thinking it hit Neon.
 */
export function assertSafeMigrationTarget(info: DatabaseConnectionInfo): void {
  const onVercelBuild =
    process.env.VERCEL === '1' &&
    (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview');
  const isProductionNode = process.env.NODE_ENV === 'production' && onVercelBuild;

  if (info.isLocalhost && (onVercelBuild || isProductionNode)) {
    throw new Error(
      [
        'Refusing to run migrations against localhost in a production/Vercel context.',
        'Check DATABASE_URL in Vercel → Project → Settings → Environment Variables.',
        'Production and Preview must point at your managed Postgres host (Neon), not localhost.',
      ].join('\n'),
    );
  }
}

export async function readMigrationStats(sql: Sql): Promise<{
  appliedCount: number;
  latestMigration: string | null;
}> {
  try {
    const rows = await sql<{ count: string; latest: string | null }[]>`
      SELECT
        count(*)::text AS count,
        max(created_at)::text AS latest
      FROM drizzle.__drizzle_migrations
    `;
    return {
      appliedCount: Number(rows[0]?.count ?? 0),
      latestMigration: rows[0]?.latest ?? null,
    };
  } catch {
    return { appliedCount: 0, latestMigration: null };
  }
}
