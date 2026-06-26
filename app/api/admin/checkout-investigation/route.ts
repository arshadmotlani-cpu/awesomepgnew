import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  runCheckoutProductionInvestigation,
  runCheckoutProductionRepairs,
} from '@/src/services/checkoutProductionInvestigation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const report = await runCheckoutProductionInvestigation();
  return NextResponse.json({ ok: true, report });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== 'super_admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (!body.confirm) {
    return NextResponse.json(
      { ok: false, error: 'Pass { "confirm": true } to run production repairs.' },
      { status: 400 },
    );
  }

  const repairs = await runCheckoutProductionRepairs(session.adminId);
  const report = await runCheckoutProductionInvestigation();
  return NextResponse.json({ ok: true, repairs, report });
}
