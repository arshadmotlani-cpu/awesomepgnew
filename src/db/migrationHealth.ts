import fs from 'node:fs';
import path from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { resolveDatabaseUrl } from '@/src/lib/db/connectionOptions';
import { createClient } from './client';

export type RepoMigration = {
  tag: string;
  idx: number;
  hash: string;
};

export type MigrationHealth = {
  ok: boolean;
  latestCodeVersion: string | null;
  currentDbVersion: string | null;
  pendingCount: number;
  pending: string[];
  appliedCount: number;
  codeCount: number;
  error?: string;
};

export function migrationsFolder(): string {
  return path.join(process.cwd(), 'src/db/migrations');
}

export type SafeRepoMigrationsResult =
  | { ok: true; migrations: RepoMigration[] }
  | { ok: false; error: string };

/** Read repository migrations without throwing — safe for server/edge-adjacent callers. */
export function safeListRepoMigrations(): SafeRepoMigrationsResult {
  try {
    const folder = migrationsFolder();
    const journalPath = path.join(folder, 'meta/_journal.json');
    if (!fs.existsSync(journalPath)) {
      return { ok: false, error: `Journal not found at ${journalPath}` };
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries?: Array<{ tag: string; idx: number }>;
    };

    if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
      return { ok: false, error: 'Invalid migration journal: missing entries array' };
    }

    const files = readMigrationFiles({ migrationsFolder: folder });
    if (!Array.isArray(files) || files.length !== journal.entries.length) {
      return {
        ok: false,
        error: `Migration file count (${files?.length ?? 0}) does not match journal (${journal.entries.length})`,
      };
    }

    const migrations = journal.entries.map((entry, i) => {
      const file = files[i];
      if (!file?.hash) {
        throw new Error(`Missing hash for migration ${entry.tag}`);
      }
      return {
        tag: entry.tag,
        idx: entry.idx,
        hash: file.hash,
      };
    });

    return { ok: true, migrations };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/** All migrations declared in meta/_journal.json, in apply order. Throws on metadata errors. */
export function listRepoMigrations(): RepoMigration[] {
  const result = safeListRepoMigrations();
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.migrations;
}

export function formatMigrationHealthError(health: MigrationHealth): string {
  const pending = health.pending ?? [];
  const lines = [
    '✗ Database migrations are out of date.',
    '',
    `  Code expects: ${health.latestCodeVersion ?? '—'} (${health.codeCount} migrations)`,
    `  Database at:  ${health.currentDbVersion ?? '— (none applied)'} (${health.appliedCount} applied)`,
    `  Pending:      ${health.pendingCount}`,
  ];
  if (pending.length > 0) {
    lines.push('', '  Missing migrations:');
    for (const tag of pending) {
      lines.push(`    - ${tag}`);
    }
  }
  if (health.error) {
    lines.push('', `  Error: ${health.error}`);
  }
  lines.push('', '  Run: npm run db:migrate');
  return lines.join('\n');
}

function degradedHealth(error: string, partial?: Partial<MigrationHealth>): MigrationHealth {
  return {
    ok: false,
    latestCodeVersion: null,
    currentDbVersion: null,
    pendingCount: 0,
    pending: [],
    appliedCount: 0,
    codeCount: 0,
    error,
    ...partial,
  };
}

/** Never throws — returns degraded status when metadata or DB is unavailable. */
export async function checkMigrationHealth(): Promise<MigrationHealth> {
  try {
    const repoResult = safeListRepoMigrations();
    if (!repoResult.ok) {
      return degradedHealth(`Could not read migration metadata: ${repoResult.error}`);
    }

    const repo = repoResult.migrations;
    const latestCodeVersion = repo.at(-1)?.tag ?? null;
    const codeCount = repo.length;

    if (!resolveDatabaseUrl()) {
      return {
        ok: false,
        latestCodeVersion,
        currentDbVersion: null,
        pendingCount: codeCount,
        pending: repo.map((m) => m.tag),
        appliedCount: 0,
        codeCount,
        error: 'Database connection string is not set (DATABASE_URL or POSTGRES_URL)',
      };
    }

    const { sql, close } = createClient({ max: 1 });
    try {
      const applied = await sql<{ hash: string }[]>`
        SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at
      `;
      const appliedSet = new Set(applied.map((r) => r.hash));
      const pending = repo.filter((m) => !appliedSet.has(m.hash)).map((m) => m.tag);

      let currentDbVersion: string | null = null;
      for (const m of repo) {
        if (appliedSet.has(m.hash)) currentDbVersion = m.tag;
      }

      return {
        ok: pending.length === 0,
        latestCodeVersion,
        currentDbVersion,
        pendingCount: pending.length,
        pending,
        appliedCount: applied.length,
        codeCount,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latestCodeVersion,
        currentDbVersion: null,
        pendingCount: codeCount,
        pending: repo.map((m) => m.tag),
        appliedCount: 0,
        codeCount,
        error: message,
      };
    } finally {
      await close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return degradedHealth(message);
  }
}
