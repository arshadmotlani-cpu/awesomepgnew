import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { defineConfig } from 'drizzle-kit';
import { getPlatformDatabaseUrl } from '@/src/platform/lib/db/env';

const url = getPlatformDatabaseUrl();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/platform/db/schema/index.ts',
  out: './src/platform/db/migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
