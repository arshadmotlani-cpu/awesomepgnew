import { NextResponse } from 'next/server';
import { getActiveImpersonationContext } from '@/src/lib/auth/impersonation';
import { getAdminSession, getCustomerSession } from '@/src/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [adminSession, customerSession, impersonation] = await Promise.all([
    getAdminSession(),
    getCustomerSession(),
    getActiveImpersonationContext(),
  ]);

  return NextResponse.json({
    ok: true,
    impersonating: Boolean(impersonation),
    impersonation: impersonation
      ? {
          impersonationId: impersonation.impersonationId,
          residentName: impersonation.residentName,
          residentPhone: impersonation.residentPhone,
          bookingId: impersonation.bookingId,
          bookingCode: impersonation.bookingCode,
          pgName: impersonation.pgName,
          roomNumber: impersonation.roomNumber,
          bedCode: impersonation.bedCode,
          adminName: impersonation.adminName,
          reason: impersonation.reason,
          startedAt: impersonation.startedAt.toISOString(),
          adminReturnPath: impersonation.adminReturnPath,
        }
      : null,
    hasAdminSession: Boolean(adminSession),
    hasCustomerSession: Boolean(customerSession),
    customerSessionId: customerSession?.sessionId ?? null,
    customerExpiresAt: customerSession?.expiresAt.toISOString() ?? null,
  });
}
