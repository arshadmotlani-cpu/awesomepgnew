/* eslint-disable no-console */
/**
 * READ-ONLY Hair / FYH database introspection for SaaS Phase 0B.
 *
 * Reports: table row estimates, indexes, foreign keys, unique constraints.
 * Does NOT INSERT, UPDATE, DELETE, or DDL.
 *
 * Usage:
 *   npx tsx scripts/hair-db-introspection-readonly.ts
 *   npx tsx scripts/hair-db-introspection-readonly.ts --json > docs/foryourhair/PHASE_0B_INTROSPECTION.json
 *
 * Requires HAIR_DATABASE_URL (or Vercel Neon aliases). Safe for production read.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { loadScriptEnv } from '@/src/lib/db/loadEnv';

loadScriptEnv();

import { closeHairDb, createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseUrl } from '@/src/hair/lib/db/env';

type TableStat = {
  schema: string;
  table: string;
  rowEstimate: number | null;
  totalBytes: number | null;
};

type IndexRow = {
  schema: string;
  table: string;
  indexName: string;
  indexDef: string;
  isUnique: boolean;
  isPrimary: boolean;
};

type FkRow = {
  constraintName: string;
  table: string;
  column: string;
  foreignTable: string;
  foreignColumn: string;
};

type UniqueRow = {
  table: string;
  constraintName: string;
  columns: string[];
};

export type HairDbIntrospectionReport = {
  generatedAt: string;
  databaseUrlHost: string;
  tableStats: TableStat[];
  indexes: IndexRow[];
  foreignKeys: FkRow[];
  uniqueConstraints: UniqueRow[];
  fyhTableCount: number;
  wfTableCount: number;
};

function maskDatabaseHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname ? u.pathname : ''}`;
  } catch {
    return '(unparseable-url)';
  }
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const url = getHairDatabaseUrl();
  const { db, close } = createHairClient({ max: 1 });

  const report: HairDbIntrospectionReport = {
    generatedAt: new Date().toISOString(),
    databaseUrlHost: maskDatabaseHost(url),
    tableStats: [],
    indexes: [],
    foreignKeys: [],
    uniqueConstraints: [],
    fyhTableCount: 0,
    wfTableCount: 0,
  };

  try {
    const tableStats = await db.execute(sql`
      SELECT
        s.schemaname AS schema,
        s.relname AS table,
        s.n_live_tup::bigint AS row_estimate,
        pg_total_relation_size(s.relid)::bigint AS total_bytes
      FROM pg_stat_user_tables s
      WHERE s.schemaname = 'public'
        AND (s.relname LIKE 'fyh_%' OR s.relname LIKE 'wf_%')
      ORDER BY s.relname
    `);

    report.tableStats = (tableStats as Array<Record<string, unknown>>).map((r) => ({
      schema: String(r.schema ?? r.schemaname ?? 'public'),
      table: String(r.table ?? r.relname ?? ''),
      rowEstimate:
        r.row_estimate != null || r.row_estimate === 0
          ? Number(r.row_estimate)
          : r.n_live_tup != null
            ? Number(r.n_live_tup)
            : null,
      totalBytes:
        r.total_bytes != null
          ? Number(r.total_bytes)
          : null,
    }));

    report.fyhTableCount = report.tableStats.filter((t) => t.table.startsWith('fyh_')).length;
    report.wfTableCount = report.tableStats.filter((t) => t.table.startsWith('wf_')).length;

    const indexes = await db.execute(sql`
      SELECT
        n.nspname AS schema,
        t.relname AS table,
        i.relname AS index_name,
        pg_get_indexdef(i.oid) AS index_def,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND (t.relname LIKE 'fyh_%' OR t.relname LIKE 'wf_%')
      ORDER BY t.relname, i.relname
    `);

    report.indexes = (indexes as Array<{
      schema: string;
      table: string;
      index_name: string;
      index_def: string;
      is_unique: boolean;
      is_primary: boolean;
    }>).map((r) => ({
      schema: r.schema,
      table: r.table,
      indexName: r.index_name,
      indexDef: r.index_def,
      isUnique: r.is_unique,
      isPrimary: r.is_primary,
    }));

    const fks = await db.execute(sql`
      SELECT
        tc.constraint_name,
        kcu.table_name AS table,
        kcu.column_name AS column,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND (kcu.table_name LIKE 'fyh_%' OR kcu.table_name LIKE 'wf_%')
      ORDER BY kcu.table_name, tc.constraint_name, kcu.ordinal_position
    `);

    report.foreignKeys = (fks as Array<{
      constraint_name: string;
      table: string;
      column: string;
      foreign_table: string;
      foreign_column: string;
    }>).map((r) => ({
      constraintName: r.constraint_name,
      table: r.table,
      column: r.column,
      foreignTable: r.foreign_table,
      foreignColumn: r.foreign_column,
    }));

    const uniques = await db.execute(sql`
      SELECT
        tc.table_name AS table,
        tc.constraint_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
        AND (tc.table_name LIKE 'fyh_%' OR tc.table_name LIKE 'wf_%')
      ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    `);

    const uniqueMap = new Map<string, UniqueRow>();
    for (const row of uniques as Array<{
      table: string;
      constraint_name: string;
      column_name: string;
    }>) {
      const key = `${row.table}:${row.constraint_name}`;
      const existing = uniqueMap.get(key);
      if (existing) {
        existing.columns.push(row.column_name);
      } else {
        uniqueMap.set(key, {
          table: row.table,
          constraintName: row.constraint_name,
          columns: [row.column_name],
        });
      }
    }
    report.uniqueConstraints = [...uniqueMap.values()];
  } finally {
    await close();
    await closeHairDb();
  }

  if (jsonOut) {
    const outPath = resolve(
      process.cwd(),
      'docs/foryourhair/PHASE_0B_INTROSPECTION.json',
    );
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Wrote ${outPath}`);
    return;
  }

  console.log('=== Hair DB introspection (read-only) ===');
  console.log('Host:', report.databaseUrlHost);
  console.log('Generated:', report.generatedAt);
  console.log(`Tables: ${report.tableStats.length} (fyh: ${report.fyhTableCount}, wf: ${report.wfTableCount})`);
  console.log('\n--- Row estimates (pg_stat_user_tables.n_live_tup) ---');
  for (const t of report.tableStats) {
    const rows = t.rowEstimate ?? '?';
    const kb = t.totalBytes != null ? Math.round(t.totalBytes / 1024) : '?';
    console.log(`${t.table.padEnd(40)} rows~${rows}  size~${kb}KB`);
  }
  console.log('\n--- Foreign keys ---');
  for (const fk of report.foreignKeys) {
    console.log(
      `${fk.table}.${fk.column} → ${fk.foreignTable}.${fk.foreignColumn} (${fk.constraintName})`,
    );
  }
  console.log('\n--- Unique constraints (non-PK) ---');
  for (const u of report.uniqueConstraints) {
    if (u.constraintName.endsWith('_pkey')) continue;
    console.log(`${u.table}: ${u.constraintName} (${u.columns.join(', ')})`);
  }
}

main().catch((err) => {
  console.error('[hair-db-introspection-readonly]', err);
  process.exit(1);
});
