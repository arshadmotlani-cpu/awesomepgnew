import { redirect } from 'next/navigation';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { OfficeLocationSettingsForm } from '@/src/workforce/components/attendance/OfficeLocationSettingsForm';
import { getOfficeLocationConfig } from '@/src/workforce/services/officeLocation';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export default async function AttendanceSettingsPage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/settings');

  const session = await getHairSession();
  if (!session) redirect('/login');
  if (!session.workforceEmployeeId && session.admin.role !== 'super_admin') {
    redirect('/login');
  }

  const allowed =
    session.admin.role === 'super_admin' ||
    (session.workforceEmployeeId
      ? await employeeHasPermission(
          session.workforceEmployeeId,
          'fyh_salon',
          'attendance.manage_office',
        )
      : false);
  if (!allowed) redirect('/settings');

  const ctx = await getTenantContextForPage();
  const office = await getOfficeLocationConfig(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Office location</h1>
        <p className="text-sm text-fyh-text-secondary">
          Attendance geofence for your organization. Each tenant saves its own office coordinates.
        </p>
      </div>
      <OfficeLocationSettingsForm
        initialLatitude={office.officeLatitude}
        initialLongitude={office.officeLongitude}
        initialLabel={office.officeLabel}
        radiusMetres={office.officeRadiusMetres}
      />
    </div>
  );
}
