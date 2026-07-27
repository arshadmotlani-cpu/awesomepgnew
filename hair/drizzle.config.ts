import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { defineConfig } from 'drizzle-kit';
import { getHairDatabaseUrl } from '@/src/hair/lib/db/env';

const url = getHairDatabaseUrl();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/hair/db/schema/index.ts',
  out: './src/hair/db/migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
