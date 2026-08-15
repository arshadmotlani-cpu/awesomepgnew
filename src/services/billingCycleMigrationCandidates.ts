/**
 * Cross-PG list of active monthly residents for 1st-of-month billing migration review.
 * Read-only — never applies migrations.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  residentBillingProfiles,
  rooms,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate, todayString } from '@/src/lib/dates';
import { isMonthlyStayType } from '@/src/lib/stayType';
import type { BillingCyclePolicy } from '@/src/services/billing';
import {
  previewBillingCycleMigration,
  type BillingCycleMigrationPreview,
} from '@/src/services/billingCycleMigration';

type MigrationPreviewResult = BillingCycleMigrationPreview | { ok: false; error: string };

function isMigrationPreviewError(
  preview: MigrationPreviewResult,
): preview is { ok: false; error: string } {
  return 'ok' in preview && preview.ok === false;
}

export type BillingCycleMigrationStatus =
  | 'already_on_1st'
  | 'eligible'
  | 'blocked'
  | 'migrated';

export type BillingCycleMigrationCandidateRow = {
  bookingId: string;
  customerId: string;
  customerName: string;
  pgId: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  checkInDate: string;
  billingDay: number;
  billingCyclePolicy: BillingCyclePolicy;
  billingCyclePolicyLabel: string;
  monthlyRentPaise: number;
  paidThroughDate: string | null;
  outstandingRentPaise: number;
  remainingPrepaidLabel: string | null;
  transitionPeriodStart: string | null;
  transitionPeriodEnd: string | null;
  transitionAmountPaise: number | null;
  firstAutoBillingDate: string | null;
  migrationStatus: BillingCycleMigrationStatus;
  blockedReason: string | null;
  billingCycleMigratedAt: string | null;
  residentHref: string;
};

function policyLabel(policy: BillingCyclePolicy): string {
  return policy === 'calendar_month_1st' ? '1st of month (calendar)' : 'Anniversary (check-in day)';
}

function remainingPrepaidLabel(paidThrough: string | null): string | null {
  if (!paidThrough) return null;
  const today = todayString();
  if (paidThrough >= today) {
    return `Prepaid through ${paidThrough}`;
  }
  return `Paid through ${paidThrough}`;
}

function deriveMigrationStatus(
  preview: BillingCycleMigrationPreview,
  migratedAt: Date | null,
): BillingCycleMigrationStatus {
  const p = preview;
  if (p.alreadyOnTarget) {
    return migratedAt ? 'migrated' : 'already_on_1st';
  }
  if (p.blocked) return 'blocked';
  return 'eligible';
}

export type ListBillingCycleMigrationCandidatesOptions = {
  /** When true, include residents already on 1st-of-month billing. */
  includeOnTarget?: boolean;
};

/** Active monthly residents scoped to admin PG access, sorted by PG then name. */
export async function listBillingCycleMigrationCandidates(
  session: AdminSession,
  opts?: ListBillingCycleMigrationCandidatesOptions,
): Promise<BillingCycleMigrationCandidateRow[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      stayType: bookings.stayType,
      durationMode: bookings.durationMode,
      checkInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      billingDay: residentBillingProfiles.billingDay,
      billingCyclePolicy: residentBillingProfiles.billingCyclePolicy,
      billingCycleMigratedAt: residentBillingProfiles.billingCycleMigratedAt,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .leftJoin(residentBillingProfiles, eq(residentBillingProfiles.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .orderBy(pgs.name, customers.fullName);

  const candidates: BillingCycleMigrationCandidateRow[] = [];

  for (const row of rows) {
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
      continue;
    }
    if (!isMonthlyStayType(row.stayType ?? row.durationMode)) {
      continue;
    }

    const billingDay = row.billingDay ?? 5;
    const policy = (row.billingCyclePolicy ?? 'anniversary') as BillingCyclePolicy;
    const onTarget = policy === 'calendar_month_1st' && billingDay === 1;

    if (!opts?.includeOnTarget && onTarget) {
      continue;
    }

    const preview = await previewBillingCycleMigration(row.bookingId);
    if (isMigrationPreviewError(preview)) {
      candidates.push({
        bookingId: row.bookingId,
        customerId: row.customerId,
        customerName: row.customerName,
        pgId: row.pgId,
        pgName: row.pgName,
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
        checkInDate: row.checkInDate,
        billingDay,
        billingCyclePolicy: policy,
        billingCyclePolicyLabel: policyLabel(policy),
        monthlyRentPaise: 0,
        paidThroughDate: null,
        outstandingRentPaise: 0,
        remainingPrepaidLabel: null,
        transitionPeriodStart: null,
        transitionPeriodEnd: null,
        transitionAmountPaise: null,
        firstAutoBillingDate: null,
        migrationStatus: 'blocked',
        blockedReason: preview.error,
        billingCycleMigratedAt: row.billingCycleMigratedAt
          ? formatDate(row.billingCycleMigratedAt)
          : null,
        residentHref: `/admin/residents/${row.customerId}`,
      });
      continue;
    }

    const p = preview;
    const migrationStatus = deriveMigrationStatus(p, row.billingCycleMigratedAt);

    candidates.push({
      bookingId: row.bookingId,
      customerId: row.customerId,
      customerName: row.customerName,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      checkInDate: p.checkInDate,
      billingDay: p.currentBillingDay,
      billingCyclePolicy: p.currentPolicy,
      billingCyclePolicyLabel: policyLabel(p.currentPolicy),
      monthlyRentPaise: p.monthlyRentPaise,
      paidThroughDate: p.paidThroughDate,
      outstandingRentPaise: p.outstandingRentPaise,
      remainingPrepaidLabel: remainingPrepaidLabel(p.paidThroughDate),
      transitionPeriodStart: p.transition?.periodStart ?? null,
      transitionPeriodEnd: p.transition?.periodEnd ?? null,
      transitionAmountPaise: p.transition?.amountPaise ?? null,
      firstAutoBillingDate: p.firstAutoBillingDate,
      migrationStatus,
      blockedReason: p.blocked ? p.blockedReason : null,
      billingCycleMigratedAt: row.billingCycleMigratedAt
        ? formatDate(row.billingCycleMigratedAt)
        : null,
      residentHref: `/admin/residents/${row.customerId}`,
    });
  }

  return candidates;
}

/** Residents who still need migration to 1st-of-month billing. */
export async function listBillingCycleMigrationNeeded(
  session: AdminSession,
): Promise<BillingCycleMigrationCandidateRow[]> {
  return listBillingCycleMigrationCandidates(session, { includeOnTarget: false });
}
