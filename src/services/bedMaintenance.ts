import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, beds, floors, pgs, rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  assertBedNotOccupiedToday,
  sanitizeBedStatusError,
} from '@/src/lib/bedOccupancyCheck';
import {
  BED_MAINTENANCE_REASONS,
  type BedMaintenanceReason,
  formatMaintenanceReason,
} from '@/src/lib/bedMaintenance';
import { todayString } from '@/src/lib/dates';
import { scheduleAvailabilityCacheInvalidation } from '@/src/lib/cache/invalidateAvailability';
import { assertBedAccess } from '@/src/services/bookingAdminOps';

export type PutBedUnderMaintenanceInput = {
  reason: BedMaintenanceReason;
  reasonCustom?: string | null;
  startDate: string;
  expectedCompletion?: string | null;
  notes?: string | null;
};

function isValidReason(value: string): value is BedMaintenanceReason {
  return BED_MAINTENANCE_REASONS.some((r) => r.value === value);
}

export async function putBedUnderMaintenance(
  session: AdminSession,
  bedId: string,
  input: PutBedUnderMaintenanceInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertBedAccess(session, bedId);
    if (!isValidReason(input.reason)) {
      return { ok: false, error: 'Select a maintenance reason.' };
    }
    if (input.reason === 'other' && !input.reasonCustom?.trim()) {
      return { ok: false, error: 'Enter a custom maintenance reason.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
      return { ok: false, error: 'Start date must be YYYY-MM-DD.' };
    }
    if (input.expectedCompletion && !/^\d{4}-\d{2}-\d{2}$/.test(input.expectedCompletion)) {
      return { ok: false, error: 'Expected completion must be YYYY-MM-DD.' };
    }

    const [before] = await db
      .select({
        status: beds.status,
        bedCode: beds.bedCode,
        pgName: pgs.name,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(and(eq(beds.id, bedId), isNull(beds.archivedAt)))
      .limit(1);
    if (!before) return { ok: false, error: 'Bed not found.' };
    if (before.status === 'maintenance') {
      return { ok: false, error: 'Bed is already under maintenance. Update details or complete maintenance first.' };
    }

    await assertBedNotOccupiedToday(bedId);

    await db
      .update(beds)
      .set({
        status: 'maintenance',
        maintenanceReason: input.reason,
        maintenanceReasonCustom:
          input.reason === 'other' ? input.reasonCustom?.trim() || null : null,
        maintenanceStartedAt: input.startDate,
        maintenanceExpectedCompletion: input.expectedCompletion?.trim() || null,
        maintenanceNotes: input.notes?.trim() || null,
        manualOccupied: false,
        manualReservedStart: null,
        manualReservedCheckIn: null,
        updatedAt: new Date(),
      })
      .where(eq(beds.id, bedId));

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'bed',
      entityId: bedId,
      action: 'bed_maintenance_started',
      diff: {
        pgName: before.pgName,
        bedCode: before.bedCode,
        from: before.status,
        to: 'maintenance',
        reason: formatMaintenanceReason(input.reason, input.reasonCustom),
        startDate: input.startDate,
        expectedCompletion: input.expectedCompletion ?? null,
      },
    });

    scheduleAvailabilityCacheInvalidation({ bedId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: sanitizeBedStatusError(err) };
  }
}

export async function completeBedMaintenance(
  session: AdminSession,
  bedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertBedAccess(session, bedId);

    const [before] = await db
      .select({
        status: beds.status,
        bedCode: beds.bedCode,
        pgName: pgs.name,
        maintenanceReason: beds.maintenanceReason,
        maintenanceStartedAt: beds.maintenanceStartedAt,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(and(eq(beds.id, bedId), isNull(beds.archivedAt)))
      .limit(1);
    if (!before) return { ok: false, error: 'Bed not found.' };
    if (before.status !== 'maintenance') {
      return { ok: false, error: 'Bed is not under maintenance.' };
    }

    await db
      .update(beds)
      .set({
        status: 'available',
        maintenanceReason: null,
        maintenanceReasonCustom: null,
        maintenanceStartedAt: null,
        maintenanceExpectedCompletion: null,
        maintenanceNotes: null,
        updatedAt: new Date(),
      })
      .where(eq(beds.id, bedId));

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'bed',
      entityId: bedId,
      action: 'bed_maintenance_completed',
      diff: {
        pgName: before.pgName,
        bedCode: before.bedCode,
        from: 'maintenance',
        to: 'available',
        previousReason: before.maintenanceReason,
        startedAt: before.maintenanceStartedAt,
        completedAt: todayString(),
      },
    });

    scheduleAvailabilityCacheInvalidation({ bedId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: sanitizeBedStatusError(err) };
  }
}
