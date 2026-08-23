import { NextRequest, NextResponse } from 'next/server';
import { getHairSession, updateHairSessionTenant } from '@/src/hair/lib/auth/session';
import { persistTenantCookies } from '@/src/hair/lib/tenant/persistTenantCookies';
import { pickResolvableMembership } from '@/src/hair/lib/tenant/selectOrganizationNav';
import { resolvePlatformUserIdForHairSession } from '@/src/hair/lib/tenant/sessionIdentity';
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
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const userId = await resolvePlatformUserIdForHairSession({
    workforceEmployeeId: session.workforceEmployeeId,
    adminId: session.admin.id,
    adminEmail: session.admin.email,
  });
  if (!userId) {
    return NextResponse.redirect(new URL('/select-organization?nobind=1', request.url));
  }

  const memberships = await listActiveMembershipsForUser(userId);
  const picked = pickResolvableMembership(memberships, null);
  const locationId = picked?.allowedLocationIds[0];
  if (!picked || !locationId) {
    return NextResponse.redirect(new URL('/select-organization?nobind=1', request.url));
  }

  await updateHairSessionTenant({
    sessionId: session.sessionId,
    organizationId: picked.organizationId,
    locationId,
  });
  await persistTenantCookies(picked.organizationId, locationId);
  return NextResponse.redirect(new URL(next, request.url));
}
