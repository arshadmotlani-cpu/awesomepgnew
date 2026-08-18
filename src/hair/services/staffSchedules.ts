import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaffSchedules } from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type StaffScheduleRow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOff: boolean;
};

export async function listSchedulesForStaff(staffId: string, ctx?: TenantContext | null) {
  return hairDb
    .select({
      dayOfWeek: fyhStaffSchedules.dayOfWeek,
      startTime: fyhStaffSchedules.startTime,
      endTime: fyhStaffSchedules.endTime,
      isOff: fyhStaffSchedules.isOff,
    })
    .from(fyhStaffSchedules)
    .where(
      and(
        orgFilter(fyhStaffSchedules.organizationId, ctx),
        locationFilter(fyhStaffSchedules.locationId, ctx),
        eq(fyhStaffSchedules.staffId, staffId),
      ),
    );
}

export async function saveStaffDaySchedule(
  input: {
    staffId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOff: boolean;
  },
  ctx?: TenantContext | null,
) {
  const [existing] = await hairDb
    .select({ id: fyhStaffSchedules.id })
    .from(fyhStaffSchedules)
    .where(
      and(
        orgFilter(fyhStaffSchedules.organizationId, ctx),
        locationFilter(fyhStaffSchedules.locationId, ctx),
        eq(fyhStaffSchedules.staffId, input.staffId),
        eq(fyhStaffSchedules.dayOfWeek, input.dayOfWeek),
      ),
    )
    .limit(1);

  const payload = {
    startTime: input.startTime,
    endTime: input.endTime,
    isOff: input.isOff,
    updatedAt: new Date(),
  };

  if (existing) {
    await hairDb
      .update(fyhStaffSchedules)
      .set(payload)
      .where(
        and(
          orgFilter(fyhStaffSchedules.organizationId, ctx),
          locationFilter(fyhStaffSchedules.locationId, ctx),
          eq(fyhStaffSchedules.id, existing.id),
        ),
      );
    return;
  }

  await hairDb.insert(fyhStaffSchedules).values({
    ...tenantWriteDefaults(ctx),
    staffId: input.staffId,
    dayOfWeek: input.dayOfWeek,
    ...payload,
  });
}
