import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  probeAllPostLoginCandidates,
  probePostLoginForCustomer,
} from '@/src/services/postLoginProbe';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get('email')?.trim();
  const customerId = req.nextUrl.searchParams.get('customerId')?.trim();

  if (email || customerId) {
    const { db } = await import('@/src/db/client');
    const { customers } = await import('@/src/db/schema');
    const { sql } = await import('drizzle-orm');

    let id = customerId;
    if (!id && email) {
      const [row] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(sql`lower(${customers.email}) = lower(${email})`)
        .limit(1);
      id = row?.id;
    }
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Customer not found' }, { status: 404 });
    }
    const result = await probePostLoginForCustomer(id);
    return NextResponse.json({ ok: !result.failed, result });
  }

  const report = await probeAllPostLoginCandidates();
  return NextResponse.json({ ok: report.failedCount === 0, report });
}
