import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { vacatingRequests } from '@/src/db/schema';
import { getAdminBookingDetail } from '@/src/db/queries/admin';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import { loadEstimatedSettlementForVacating } from '@/src/lib/vacating/estimatedSettlementPreview';
import {
  buildSettlementStatementModel,
  type SettlementStatementDocumentModel,
} from '@/src/lib/vacating/settlementStatementModel';

export async function loadSettlementStatementForVacating(
  vacatingRequestId: string,
): Promise<SettlementStatementDocumentModel | null> {
  const [vacating] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, vacatingRequestId))
    .limit(1);
  if (!vacating) return null;

  const bookingRes = await getAdminBookingDetail(vacating.bookingId);
  if (!bookingRes.ok || !bookingRes.data) return null;

  const b = bookingRes.data;
  const primaryRes = b.reservations.find((r) => r.kind === 'primary') ?? b.reservations[0];
  if (!primaryRes) return null;

  const estimatedSettlement = await loadEstimatedSettlementForVacating({
    bookingId: vacating.bookingId,
    noticeGivenDate: String(vacating.noticeGivenDate),
    vacatingDate: String(vacating.vacatingDate),
    monthlyRentPaiseSnapshot: vacating.monthlyRentPaiseSnapshot,
    noticeRentCoveredDays: vacating.noticeRentCoveredDays,
    noticeChargeableDays: vacating.noticeChargeableDays,
    deductionPaise: vacating.deductionPaise,
    noticeBreakdownJson: vacating.noticeBreakdownJson as Parameters<
      typeof loadEstimatedSettlementForVacating
    >[0]['noticeBreakdownJson'],
    stayType: b.stayType,
    durationMode: b.durationMode,
  });
  if (!estimatedSettlement) return null;

  const letterhead = buildFallbackPgLetterhead(primaryRes.pgName);

  return buildSettlementStatementModel({
    preview: estimatedSettlement,
    vacatingRequestId,
    bookingId: vacating.bookingId,
    customerName: b.customer.fullName,
    customerPhone: b.customer.phone,
    bookingCode: b.bookingCode,
    pgName: primaryRes.pgName,
    roomNumber: primaryRes.roomNumber,
    bedCode: primaryRes.bedCode,
    noticeGivenDate: String(vacating.noticeGivenDate),
    vacatingDate: String(vacating.vacatingDate),
    letterhead,
  });
}
