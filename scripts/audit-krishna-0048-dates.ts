#!/usr/bin/env npx tsx
/** Read-only date audit for APG-2026-0048 — no settlement math. */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-krishna-0048-dates');

import { desc, eq, sql } from 'drizzle-orm';
import { createClient } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  rentInvoices,
  residentBillingProfiles,
  vacatingRequests,
} from '@/src/db/schema';
import { resolveAnniversaryPeriodContainingDate } from '@/src/lib/billing/vacatingFinalPeriodRent';
import {
  resolveCheckoutTailRentPaiseForBooking,
  resolveStayCheckInDate,
} from '@/src/lib/checkout/checkoutSettlementV2Compute';
import { loadBillingCoverageModel, loadPaidInvoiceCoveragePeriods } from '@/src/services/billingCoverage';

const CODE = process.env.RESIDENT_VERIFY_BOOKING_CODE?.trim() || 'APG-2026-0048';

async function main() {
  const { db, close } = createClient({ max: 1 });

  const [b] = await db.select().from(bookings).where(eq(bookings.bookingCode, CODE)).limit(1);
  if (!b) {
    console.error(`Booking not found: ${CODE}`);
    process.exit(1);
  }

  const stays = await db
    .select({
      id: bedReservations.id,
      kind: bedReservations.kind,
      status: bedReservations.status,
      lower: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      upper: sql<string>`to_char(upper(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      createdAt: bedReservations.createdAt,
    })
    .from(bedReservations)
    .where(eq(bedReservations.bookingId, b.id))
    .orderBy(desc(bedReservations.createdAt));

  const [profile] = await db
    .select()
    .from(residentBillingProfiles)
    .where(eq(residentBillingProfiles.bookingId, b.id))
    .limit(1);

  const invoices = await db
    .select({
      id: rentInvoices.id,
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
      status: rentInvoices.status,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      rentPaise: rentInvoices.rentPaise,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, b.id))
    .orderBy(rentInvoices.dueDate);

  const [vr] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, b.id))
    .orderBy(desc(vacatingRequests.updatedAt))
    .limit(1);

  const invoiceCoverage = await loadPaidInvoiceCoveragePeriods(b.id);
  const settlementCheckIn = await resolveStayCheckInDate(b.id);

  const primaryStay = stays.find((s) => s.kind === 'primary');
  const vacatingDate = vr ? String(vr.vacatingDate).slice(0, 10) : null;
  const monthlyRent = vr?.monthlyRentPaiseSnapshot ?? 0;
  const noticeGivenDate = vr ? String(vr.noticeGivenDate).slice(0, 10) : null;

  const billingCoverage =
    vacatingDate && noticeGivenDate && monthlyRent > 0
      ? await loadBillingCoverageModel({
          bookingId: b.id,
          vacatingDate,
          noticeGivenDate,
          monthlyRentPaise: monthlyRent,
        })
      : null;

  let tailEngine: Record<string, unknown> = { vacatingDate: null };
  if (vacatingDate && invoiceCoverage.moveInDate) {
    const periodForVacate = resolveAnniversaryPeriodContainingDate({
      date: vacatingDate,
      billingDay: invoiceCoverage.billingDay,
      moveInDate: invoiceCoverage.moveInDate,
    });
    tailEngine = {
      sourceFunction: 'resolveCheckoutTailRentPaiseForBooking → computeVacatingFinalPeriodRentDecision',
      moveInDate: invoiceCoverage.moveInDate,
      billingDay: invoiceCoverage.billingDay,
      vacatingDate,
      paidPeriodsFromDb: invoiceCoverage.periods,
      anniversaryPeriodContainingVacatingDate: periodForVacate,
      tailPaiseApprovedRowRequired: await resolveCheckoutTailRentPaiseForBooking({
        bookingId: b.id,
        vacatingDate,
        monthlyRentPaise: monthlyRent,
        treatAsApprovedForTail: false,
      }),
      tailPaisePreviewTreatAsApproved: await resolveCheckoutTailRentPaiseForBooking({
        bookingId: b.id,
        vacatingDate,
        monthlyRentPaise: monthlyRent,
        treatAsApprovedForTail: true,
      }),
    };
  }

  const firstPeriod = invoiceCoverage.periods[0] ?? null;
  const sortedPeriods = [...invoiceCoverage.periods].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  );

  console.log(
    JSON.stringify(
      {
        bookingCode: CODE,
        bookingId: b.id,
        vacating: vr
          ? {
              id: vr.id,
              status: vr.status,
              vacatingDate,
              noticeGivenDate: String(vr.noticeGivenDate).slice(0, 10),
              monthlyRentPaiseSnapshot: vr.monthlyRentPaiseSnapshot,
            }
          : null,
        fields: {
          '1_bookingStartDate_billing_anchor_on_bookings_row':
            b.billingAnchorDate != null ? String(b.billingAnchorDate) : null,
          '1_also_booking_expected_checkout_date':
            b.expectedCheckoutDate != null ? String(b.expectedCheckoutDate) : null,
          '2_actualCheckIn_primary_bed_reservation_stay_range_lower': primaryStay?.lower ?? null,
          '2_primary_stay_range_upper_exclusive': primaryStay?.upper ?? null,
          '3_billingCycleAnchor_resident_billing_profile_billing_anchor_date':
            profile?.billingAnchorDate != null ? String(profile.billingAnchorDate) : null,
          '3_billingDay_resident_billing_profile': profile?.billingDay ?? null,
          '3_billingDay_fallback_from_moveIn_if_no_profile': invoiceCoverage.billingDay,
          '4_firstPaidInvoiceCoveragePeriod_clamped_to_moveIn':
            sortedPeriods[0] ?? firstPeriod,
          '4_allPaidInvoiceCoveragePeriods_clamped': sortedPeriods,
          '4_billingCoverageModel_when_vacating': billingCoverage
            ? {
                paidUntilDate: billingCoverage.paidUntilDate,
                prepaidAfterVacatingDays: billingCoverage.prepaidAfterVacatingDays,
                prepaidAfterVacatingPaise: billingCoverage.prepaidAfterVacatingPaise,
                daysPaidForSettlement: billingCoverage.daysPaidForSettlement,
                daysPaidSettlementPeriod: billingCoverage.daysPaidSettlementPeriod,
                tailRentPaise: billingCoverage.tailRentPaise,
                suppressFinalInvoice: billingCoverage.finalInvoiceSuppression,
              }
            : null,
          '4_rentInvoicesInDb': invoices.map((inv) => ({
            dueDate: String(inv.dueDate),
            billingMonth: String(inv.billingMonth),
            status: inv.status,
            paidPrincipalPaise: inv.paidPrincipalPaise,
          })),
          '5_settlementEngine_checkIn_resolveStayCheckInDate_primary_lower':
            settlementCheckIn,
          '5_settlementEngine_note':
            'computeCheckoutSettlementV2 stayCheckInDate comes from resolveStayCheckInDate (bed_reservations primary, newest createdAt)',
          '6_tailRentEngine_moveInDate': invoiceCoverage.moveInDate,
          '6_tailRentEngine_billingDay': invoiceCoverage.billingDay,
          '6_tailRentEngine_full_inputs_and_outputs': tailEngine,
        },
        divergenceCheck: {
          bookings_billingAnchorDate:
            b.billingAnchorDate != null ? String(b.billingAnchorDate) : null,
          profile_billingAnchorDate:
            profile?.billingAnchorDate != null ? String(profile.billingAnchorDate) : null,
          bedReservation_primary_lower: primaryStay?.lower ?? null,
          settlement_resolveStayCheckInDate: settlementCheckIn,
          tail_billingCoverage_moveInDate: invoiceCoverage.moveInDate,
          allMatch:
            [
              b.billingAnchorDate != null ? String(b.billingAnchorDate) : null,
              profile?.billingAnchorDate != null ? String(profile.billingAnchorDate) : null,
              primaryStay?.lower ?? null,
              settlementCheckIn,
              invoiceCoverage.moveInDate,
            ].filter(Boolean).length > 0
              ? new Set(
                  [
                    b.billingAnchorDate != null ? String(b.billingAnchorDate) : null,
                    profile?.billingAnchorDate != null ? String(profile.billingAnchorDate) : null,
                    primaryStay?.lower ?? null,
                    settlementCheckIn,
                    invoiceCoverage.moveInDate,
                  ].filter(Boolean),
                ).size === 1
              : null,
        },
        allBedReservations: stays,
      },
      null,
      2,
    ),
  );

  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
