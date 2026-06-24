import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hasDatabaseUrl } from '@/src/lib/db/env';

/** Load local env files for scripts without clobbering Vercel/CI runtime secrets. */
export function loadScriptEnv(): void {
  if (hasDatabaseUrl()) return;

  const files = [
    '.env.production.local',
    '.env.prod',
    '.env.local',
    '.env',
    '.env.repair.local',
    '.env.vercel.prod.live',
  ];

  for (const file of files) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    config({ path, override: false });
    if (hasDatabaseUrl()) return;
  }

  // Never load empty pull stubs on Vercel — they wipe integration-provided DATABASE_URL.
  if (process.env.VERCEL !== '1') {
    const pullPath = join(process.cwd(), '.env.vercel.pull.tmp');
    if (existsSync(pullPath)) {
      config({ path: pullPath, override: false });
    }
  }
}
