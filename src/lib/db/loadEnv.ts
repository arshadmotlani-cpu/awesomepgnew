/**
 * Single environment loader for scripts, drizzle-kit, and CLI tools.
 *
 * Load order (later wins for non-empty values only):
 *   1. `.env`
 *   2. `.env.local`  ← `vercel env pull .env.local` writes here
 *
 * Rules:
 *   - Never override an existing non-empty `process.env` value (shell wins).
 *   - Skip empty values from pulled files (Neon/Vercel integration placeholders).
 *
 * On Vercel/CI, runtime secrets are already in `process.env` — we never
 * clobber them with empty local files.
 */
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatDatabaseConfigReport,
  hasDatabaseUrl,
  type DatabaseEnvSource,
} from '@/src/lib/db/env';

let loaded = false;

/** Database URL keys — Neon/Vercel integration may inject these as empty strings locally. */
export const DATABASE_ENV_KEYS: readonly DatabaseEnvSource[] = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
];

/**
 * Remove empty Neon/Vercel integration placeholders from `process.env`.
 * `vercel env pull` and `vercel env run` set DATABASE_URL="" for integration secrets.
 */
export function clearEmptyDatabaseEnvPlaceholders(): void {
  for (const key of DATABASE_ENV_KEYS) {
    if (process.env[key] !== undefined && !process.env[key]?.trim()) {
      delete process.env[key];
    }
  }
}

/** Vars injected at Vercel deploy time — must not be loaded from pulled .env files locally. */
const RUNTIME_ONLY_PREFIXES = ['VERCEL_', 'VERCEL'] as const;

function isRuntimeOnlyKey(key: string): boolean {
  if (key === 'VERCEL') return true;
  return RUNTIME_ONLY_PREFIXES.some((p) => p !== 'VERCEL' && key.startsWith(p));
}

function applyEnvFile(path: string, overrideFile: boolean): void {
  const raw = readFileSync(path, 'utf8');
  const parsed = parse(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (isRuntimeOnlyKey(key)) continue;

    const trimmed = value.trim();
    if (!trimmed) continue;

    const existing = process.env[key]?.trim();
    if (existing) continue;

    if (!overrideFile && process.env[key] !== undefined) continue;
    process.env[key] = trimmed;
  }
}

export function loadAppEnv(): void {
  if (loaded) return;
  loaded = true;

  if (process.env.VERCEL === '1' && hasDatabaseUrl()) {
    return;
  }

  const cwd = process.cwd();

  const envPath = join(cwd, '.env');
  if (existsSync(envPath)) {
    applyEnvFile(envPath, false);
  }

  const localPath = join(cwd, '.env.local');
  if (existsSync(localPath)) {
    applyEnvFile(localPath, true);
  }
}

/** @deprecated Use loadAppEnv — kept for existing script imports. */
export function loadScriptEnv(): void {
  loadAppEnv();
}

const PRODUCTION_AUDIT_ENV_FILES = [
  '.env.prod.live',
  '.env.production.pull',
  '.env.production.local',
] as const;

/**
 * Load env for production audit CLI scripts (read-only live DB checks).
 *
 * Target: **Production** Neon cluster — not Preview or Development.
 *
 * Neon integration `DATABASE_URL` is injected at Vercel deploy time only.
 * It cannot be exported via `vercel env pull` or `vercel env run` (values are empty).
 *
 * Provide the URL via one of:
 *   1. Shell: `DATABASE_URL='postgresql://…' npx tsx scripts/…`
 *   2. `.env.prod.live` (gitignored) + `USE_PRODUCTION_DB=1`
 *   3. Neon dashboard → paste into `.env.local` as `DATABASE_URL`
 */
export function loadProductionAuditEnv(): void {
  clearEmptyDatabaseEnvPlaceholders();
  loadAppEnv();

  if (process.env.USE_PRODUCTION_DB !== '1') return;

  const cwd = process.cwd();
  for (const name of PRODUCTION_AUDIT_ENV_FILES) {
    const path = join(cwd, name);
    if (existsSync(path)) {
      applyEnvFile(path, true);
    }
  }
}

/** Exit with configuration help when no database URL is available. */
export function requireDatabaseUrl(scriptName: string): void {
  if (hasDatabaseUrl()) return;

  console.error(formatDatabaseConfigReport());
  console.error('');
  console.error(`Cannot run ${scriptName} — production Neon DATABASE_URL required.`);
  console.error('  DATABASE_URL=\'postgresql://…\' npx tsx scripts/' + scriptName);
  console.error('  USE_PRODUCTION_DB=1 npx tsx scripts/' + scriptName + '  # URL in .env.prod.live');
  process.exit(1);
}
