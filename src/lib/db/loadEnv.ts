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
import { hasDatabaseUrl } from '@/src/lib/db/env';

let loaded = false;

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
