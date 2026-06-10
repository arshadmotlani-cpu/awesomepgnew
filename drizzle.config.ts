import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { getDatabaseUrl } from './src/lib/db/env';

const databaseUrl = getDatabaseUrl();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: databaseUrl },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
