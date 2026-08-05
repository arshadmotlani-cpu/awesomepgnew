import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** @deprecated Use /api/admin/payments — PG admin only, not Owner OS. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = '/api/admin/payments';
  return NextResponse.redirect(url, 308);
}
