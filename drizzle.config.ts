import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from './src/lib/db/connectionOptions';

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL (or POSTGRES_URL) is not set. Copy .env.example to .env and fill it in before running drizzle-kit.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: databaseUrl },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
