import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  auditBookingStayDateIntegrity,
  formatBookingStayDateReportMarkdown,
  repairBookingStayDateIntegrity,
} from '@/src/services/bookingStayDateIntegrity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const issues = await auditBookingStayDateIntegrity();
  const uniqueResidents = new Set(issues.map((i) => i.customerId));
  const repairable = issues.filter(
    (i) => i.reservationId && !i.issues.includes('missing_primary_reservation'),
  );
  const repairableResidents = new Set(repairable.map((i) => i.customerId));

  return NextResponse.json({
    ok: true,
    issueBookingCount: issues.length,
    affectedResidentCount: uniqueResidents.size,
    repairableBookingCount: repairable.length,
    repairableResidentCount: repairableResidents.size,
    residents: [...uniqueResidents].map((customerId) => {
      const rows = issues.filter((i) => i.customerId === customerId);
      return {
        customerId,
        email: rows[0]?.customerEmail ?? null,
        name: rows[0]?.customerName ?? null,
        bookingCodes: rows.map((r) => r.bookingCode),
        issues: rows.flatMap((r) => r.issues),
      };
    }),
    issues,
    markdown: formatBookingStayDateReportMarkdown({
      auditedAt: new Date().toISOString(),
      execute: false,
      totalActiveBookings: 0,
      issueCount: issues.length,
      repairableCount: repairable.length,
      repairedCount: 0,
      skippedCount: issues.length - repairable.length,
      issues,
      repairs: [],
      verification: [],
    }),
  });
}

export async function POST() {
  const session = await getAdminSession();
  if (!session || session.role !== 'super_admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const report = await repairBookingStayDateIntegrity({ execute: true });
  const uniqueResidents = new Set(report.repairs.map((r) => r.bookingId));

  return NextResponse.json({
    ok: report.issueCount === 0,
    repairedCount: report.repairedCount,
    repairBookingCount: report.repairs.length,
    affectedResidentCount: new Set(
      report.issues
        .filter((i) => report.repairs.some((r) => r.bookingId === i.bookingId))
        .map((i) => i.customerId),
    ).size,
    report,
    verification: report.verification,
    markdown: formatBookingStayDateReportMarkdown(report),
  });
}
