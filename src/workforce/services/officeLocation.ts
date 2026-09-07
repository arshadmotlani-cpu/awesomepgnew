import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  DEFAULT_ATTENDANCE_RADIUS_METRES,
  fyhSettings,
  type FyhAttendanceSettings,
} from '@/src/hair/db/schema/settings';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type OfficeLocationConfig = {
  officeLatitude: number | null;
  officeLongitude: number | null;
  officeRadiusMetres: number;
  officeLabel: string | null;
  configured: boolean;
};

function normalizeSettings(raw: FyhAttendanceSettings | null | undefined): OfficeLocationConfig {
  const lat = raw?.officeLatitude;
  const lon = raw?.officeLongitude;
  const hasCoords = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  return {
    officeLatitude: hasCoords ? lat : null,
    officeLongitude: hasCoords ? lon : null,
    officeRadiusMetres: raw?.officeRadiusMetres ?? DEFAULT_ATTENDANCE_RADIUS_METRES,
    officeLabel: raw?.officeLabel ?? null,
    configured: hasCoords,
  };
}

export async function getOfficeLocationConfig(
  ctx?: TenantContext | null,
): Promise<OfficeLocationConfig> {
  ctx = await resolveTenantContextForService(ctx);
  const [row] = await hairDb
    .select({ attendanceSettings: fyhSettings.attendanceSettings })
    .from(fyhSettings)
    .where(orgFilter(fyhSettings.organizationId, ctx))
    .limit(1);
  return normalizeSettings(row?.attendanceSettings);
}

export async function updateOfficeLocationConfig(
  input: {
    officeLatitude: number;
    officeLongitude: number;
    officeLabel?: string | null;
    officeRadiusMetres?: number;
  },
  ctx?: TenantContext | null,
): Promise<OfficeLocationConfig> {
  ctx = await resolveTenantContextForService(ctx);
  if (!Number.isFinite(input.officeLatitude) || !Number.isFinite(input.officeLongitude)) {
    throw new Error('Invalid office coordinates.');
  }
  const radius = input.officeRadiusMetres ?? DEFAULT_ATTENDANCE_RADIUS_METRES;
  if (radius <= 0 || radius > 500) throw new Error('Office radius must be between 1 and 500 metres.');

  const next: FyhAttendanceSettings = {
    officeLatitude: input.officeLatitude,
    officeLongitude: input.officeLongitude,
    officeRadiusMetres: radius,
    officeLabel: input.officeLabel?.trim() || null,
  };

  const [existing] = await hairDb
    .select({ id: fyhSettings.id, attendanceSettings: fyhSettings.attendanceSettings })
    .from(fyhSettings)
    .where(orgFilter(fyhSettings.organizationId, ctx))
    .limit(1);

  if (!existing) throw new Error('Salon settings not found.');

  await hairDb
    .update(fyhSettings)
    .set({
      attendanceSettings: next,
      updatedAt: new Date(),
    })
    .where(eq(fyhSettings.id, existing.id));

  return normalizeSettings(next);
}

export async function requireConfiguredOfficeLocation(
  ctx?: TenantContext | null,
): Promise<OfficeLocationConfig & { configured: true }> {
  const office = await getOfficeLocationConfig(ctx);
  if (!office.configured || office.officeLatitude == null || office.officeLongitude == null) {
    throw new Error('Office location is not configured. Ask your owner to set it in Settings.');
  }
  return office as OfficeLocationConfig & { configured: true };
}
