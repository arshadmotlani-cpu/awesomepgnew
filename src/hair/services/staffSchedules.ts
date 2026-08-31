import { and, eq, type SQL } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaffSchedules } from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { orgFilter, locationFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';

export type StaffScheduleTenantScope = Pick<TenantContext, 'organizationId' | 'locationId'>;

function tenantScopeForStaffSchedule(
  ctx?: TenantContext | null,
  scope?: StaffScheduleTenantScope | null,
): {
  org: SQL;
  loc?: SQL;
  writeDefaults: ReturnType<typeof tenantWriteDefaults>;
} {
  if (ctx) {
    return {
      org: orgFilter(fyhStaffSchedules.organizationId, ctx),
      loc: locationFilter(fyhStaffSchedules.locationId, ctx),
      writeDefaults: tenantWriteDefaults(ctx),
    };
  }
  if (isFyhSaasTenantEnabled()) {
    if (!scope?.organizationId || !scope?.locationId) {
      throw new Error('Tenant context is required when FYH_SAAS_TENANT is enabled');
    }
    const mini: TenantContext = {
      userId: 'workforce',
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      membershipId: 'workforce',
      membershipRole: 'staff',
      allowedLocationIds: [scope.locationId],
      permissions: [],
    };
    return {
      org: orgFilter(fyhStaffSchedules.organizationId, mini),
      loc: locationFilter(fyhStaffSchedules.locationId, mini),
      writeDefaults: tenantWriteDefaults(mini),
    };
  }
  return {
    org: orgFilter(fyhStaffSchedules.organizationId, null),
    loc: locationFilter(fyhStaffSchedules.locationId, null),
    writeDefaults: tenantWriteDefaults(null),
  };
}

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
  scope?: StaffScheduleTenantScope | null,
) {
  const tenant = tenantScopeForStaffSchedule(ctx, scope);
  const whereBase = and(
    tenant.org,
    tenant.loc,
    eq(fyhStaffSchedules.staffId, input.staffId),
    eq(fyhStaffSchedules.dayOfWeek, input.dayOfWeek),
  );

  const [existing] = await hairDb
    .select({ id: fyhStaffSchedules.id })
    .from(fyhStaffSchedules)
    .where(whereBase)
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
      .where(and(tenant.org, tenant.loc, eq(fyhStaffSchedules.id, existing.id)));
    return;
  }

  await hairDb.insert(fyhStaffSchedules).values({
    ...tenant.writeDefaults,
    staffId: input.staffId,
    dayOfWeek: input.dayOfWeek,
    ...payload,
  });
}
