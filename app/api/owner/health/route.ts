import { NextResponse } from 'next/server';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';
import { OWNER_OS_BRAIN_REGISTRY } from '@/src/owner/brains/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: 'owner_os',
    host: 'owner.awesomepg.in',
    databaseConfigured: hasOwnerDatabaseUrl(),
    brains: OWNER_OS_BRAIN_REGISTRY.map((b) => ({ id: b.id, status: b.status })),
  });
}
