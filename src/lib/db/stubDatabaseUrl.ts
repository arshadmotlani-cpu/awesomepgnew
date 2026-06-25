import { getDatabaseHost, hasDatabaseUrl } from '@/src/lib/db/env';

/** Vercel CLI injects a localhost placeholder — not the live production cluster. */
export function isStubDatabaseUrl(): boolean {
  if (!hasDatabaseUrl()) return true;
  const host = getDatabaseHost();
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    '';
  return url.length > 0 && url.length < 64;
}

export function describeDatabaseTarget(): string {
  if (!hasDatabaseUrl()) return 'missing';
  if (isStubDatabaseUrl()) return `stub (${getDatabaseHost() ?? 'unknown'})`;
  return getDatabaseHost() ?? 'configured';
}
