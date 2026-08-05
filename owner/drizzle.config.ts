import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { defineConfig } from 'drizzle-kit';
import { getOwnerDatabaseUrl } from '@/src/owner/lib/db/env';

const url = getOwnerDatabaseUrl();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/owner/db/schema/index.ts',
  out: './src/owner/db/migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
