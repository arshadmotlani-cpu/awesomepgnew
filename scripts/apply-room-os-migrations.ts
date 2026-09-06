/**
 * Apply only pending Room OS infrastructure migrations (0132–0138).
 * Uses the same hash/journal detection as src/db/migrate.ts.
 * Does NOT run checkout-settlement backfill or resident data repairs.
 *
 * Usage: npx tsx scripts/apply-room-os-migrations.ts
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && !value.includes('placeholder')) {
        process.env.DATABASE_URL = value;
        console.log(`DATABASE_URL loaded from ${path}`);
        return;
      }
    } catch {
      // try next
    }
  }
}

ensureDatabaseUrl();
if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const ROOM_OS_TAGS = new Set([
  '0132_room_os_outbox',
  '0133_property_os_index',
  '0134_work_queue_index',
  '0135_room_os_outbox_retry',
  '0136_room_os_published_rules',
  '0137_room_os_workflow_instances',
  '0138_business_metrics_index',
]);

const MIGRATIONS_FOLDER = 'src/db/migrations';
const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';

async function main() {
  const { createClient } = await import('../src/db/client');
  const { getDatabaseConnectionInfo } = await import('../src/lib/db/env');
  const {
    assertSafeMigrationTarget,
    formatMigrationConnectionBanner,
    readMigrationStats,
  } = await import('../src/lib/db/migrationSafety');

  const connectionInfo = getDatabaseConnectionInfo();
  assertSafeMigrationTarget(connectionInfo);
  const { db, sql: pg, close } = createClient({ max: 1 });
  const statsBefore = await readMigrationStats(pg);
  console.log(formatMigrationConnectionBanner(connectionInfo, statsBefore));

  const journal = JSON.parse(
    readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, 'utf8'),
  ) as { entries: Array<{ tag: string; when: number }> };
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });

  const appliedRows = await db.execute<{ hash: string }>(
    sql.raw(`SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`),
  );
  const appliedHashes = new Set(appliedRows.map((row) => row.hash));

  const pendingRoomOs: Array<{ tag: string; hash: string; sql: string[]; when: number }> = [];
  for (let i = 0; i < journal.entries.length; i += 1) {
    const entry = journal.entries[i]!;
    const migration = migrations[i]!;
    if (!ROOM_OS_TAGS.has(entry.tag)) continue;
    if (appliedHashes.has(migration.hash)) continue;
    pendingRoomOs.push({
      tag: entry.tag,
      hash: migration.hash,
      sql: migration.sql,
      when: entry.when,
    });
  }

  if (pendingRoomOs.length === 0) {
    console.log('✓ Room OS migrations already applied');
    await close();
    return;
  }

  console.log(
    `→ Applying ${pendingRoomOs.length} Room OS migration(s): ${pendingRoomOs
      .map((m) => m.tag)
      .join(', ')}`,
  );

  for (const migration of pendingRoomOs) {
    await db.transaction(async (tx) => {
      for (const stmt of migration.sql) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        await tx.execute(sql.raw(trimmed));
      }
      await tx.execute(
        sql`INSERT INTO ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(
          MIGRATIONS_TABLE,
        )} (hash, created_at) VALUES (${migration.hash}, ${migration.when})`,
      );
    });
    console.log(`✓ ${migration.tag} (${migration.hash.slice(0, 12)}…)`);
  }

  const statsAfter = await readMigrationStats(pg);
  console.log(formatMigrationConnectionBanner(connectionInfo, statsAfter));
  await close();
}

main().catch((err) => {
  console.error('✗ Room OS migration failed:', err);
  process.exit(1);
});
