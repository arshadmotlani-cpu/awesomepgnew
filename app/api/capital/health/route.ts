import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { hasInvestDatabaseUrl } from '@/src/capital/lib/db/env';
import { requireCapitalApiAuth } from '@/src/capital/lib/api/guard';

export async function GET() {
  const auth = await requireCapitalApiAuth();
  if ('error' in auth) return auth.error;

  let databaseOk = false;
  if (hasInvestDatabaseUrl()) {
    try {
      await capitalDb.execute(sql`SELECT 1`);
      databaseOk = true;
    } catch {
      databaseOk = false;
    }
  }

  return NextResponse.json({
    ok: databaseOk,
    product: 'automotive-capital',
    timestamp: new Date().toISOString(),
  });
}
