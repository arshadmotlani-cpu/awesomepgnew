import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees } from '@/src/workforce/db/schema';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { persistTenantCookies } from '@/src/hair/lib/tenant/persistTenantCookies';
import { pickResolvableMembership } from '@/src/hair/lib/tenant/selectOrganizationNav';
import { listActiveMembershipsForUser } from '@/src/platform/services/memberships';

export async function GET(request: NextRequest) {
  const nextRaw = request.nextUrl.searchParams.get('next') ?? '/dashboard/revenue';
  const next =
    nextRaw.startsWith('/') &&
    !nextRaw.startsWith('//') &&
    !nextRaw.startsWith('/select-organization')
      ? nextRaw
      : '/dashboard/revenue';

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) {
    return NextResponse.redirect(new URL('/select-organization?nobind=1', request.url));
  }

  const [emp] = await hairDb
    .select({ userId: wfEmployees.userId })
    .from(wfEmployees)
    .where(eq(wfEmployees.id, session.workforceEmployeeId))
    .limit(1);
  if (!emp?.userId) {
    return NextResponse.redirect(new URL('/select-organization?nobind=1', request.url));
  }

  const memberships = await listActiveMembershipsForUser(emp.userId);
  const picked = pickResolvableMembership(memberships, null);
  const locationId = picked?.allowedLocationIds[0];
  if (!picked || !locationId) {
    return NextResponse.redirect(new URL('/select-organization?nobind=1', request.url));
  }

  await persistTenantCookies(picked.organizationId, locationId);
  return NextResponse.redirect(new URL(next, request.url));
}
