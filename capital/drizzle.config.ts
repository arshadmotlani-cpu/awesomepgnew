import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { defineConfig } from 'drizzle-kit';
import { getInvestDatabaseUrl } from '@/src/capital/lib/db/env';

const url = getInvestDatabaseUrl();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/capital/db/schema/index.ts',
  out: './src/capital/db/migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
