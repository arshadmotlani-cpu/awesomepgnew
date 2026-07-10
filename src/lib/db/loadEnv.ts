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

export const INVEST_DATABASE_ENV_KEYS = [
  'INVEST_DATABASE_URL',
  'INVEST_DATABASE_DATABASE_URL',
  'INVEST_POSTGRES_URL',
  'INVEST_POSTGRES_PRISMA_URL',
] as const;

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
  for (const key of INVEST_DATABASE_ENV_KEYS) {
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

/** Snapshot non-empty database URLs already set in the shell (must win over files). */
function snapshotShellDatabaseEnv(): Partial<Record<DatabaseEnvSource, string>> {
  const shell: Partial<Record<DatabaseEnvSource, string>> = {};
  for (const key of DATABASE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) shell[key] = value;
  }
  return shell;
}

function restoreShellDatabaseEnv(shell: Partial<Record<DatabaseEnvSource, string>>): void {
  for (const key of DATABASE_ENV_KEYS) {
    if (!(key in shell)) continue;
    const value = shell[key];
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
}

/** Production Neon file — database keys override .env / .env.local file values. */
function applyProdLiveEnvFile(path: string): void {
  const raw = readFileSync(path, 'utf8');
  const parsed = parse(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (isRuntimeOnlyKey(key)) continue;

    const trimmed = value.trim();
    if (!trimmed) continue;

    if (DATABASE_ENV_KEYS.includes(key as DatabaseEnvSource)) {
      process.env[key] = trimmed;
      continue;
    }

    const existing = process.env[key]?.trim();
    if (!existing) process.env[key] = trimmed;
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
 *   1. `.env.prod.live` (gitignored) — loaded automatically when present
 *   2. Shell: `DATABASE_URL='postgresql://…' npx tsx scripts/…`
 *   3. Neon dashboard → paste into `.env.local` as `DATABASE_URL`
 */
export function loadProductionAuditEnv(): void {
  const shellDatabaseEnv = snapshotShellDatabaseEnv();

  clearEmptyDatabaseEnvPlaceholders();
  loadAppEnv();

  const cwd = process.cwd();
  const prodLivePath = join(cwd, '.env.prod.live');
  if (existsSync(prodLivePath)) {
    applyProdLiveEnvFile(prodLivePath);
  } else if (process.env.USE_PRODUCTION_DB === '1') {
    for (const name of PRODUCTION_AUDIT_ENV_FILES) {
      if (name === '.env.prod.live') continue;
      const path = join(cwd, name);
      if (existsSync(path)) {
        applyEnvFile(path, true);
      }
    }
  }

  restoreShellDatabaseEnv(shellDatabaseEnv);
}

/** Exit with configuration help when no database URL is available. */
export function requireDatabaseUrl(scriptName: string): void {
  if (hasDatabaseUrl()) return;

  console.error(formatDatabaseConfigReport());
  console.error('');
  console.error(`Cannot run ${scriptName} — production Neon DATABASE_URL required.`);
  console.error('  Create .env.prod.live (gitignored) with DATABASE_URL from Neon dashboard');
  console.error('  DATABASE_URL=\'postgresql://…\' npx tsx scripts/' + scriptName);
  process.exit(1);
}
