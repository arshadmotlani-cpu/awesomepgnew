import { redirect } from 'next/navigation';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { OfficeLocationSettingsForm } from '@/src/workforce/components/attendance/OfficeLocationSettingsForm';
import { getOfficeLocationConfig } from '@/src/workforce/services/officeLocation';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export default async function AttendanceSettingsPage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/settings');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const allowed = await employeeHasPermission(
    session.workforceEmployeeId,
    'fyh_salon',
    'attendance.manage_office',
  );
  if (!allowed) redirect('/settings');

  const office = await getOfficeLocationConfig();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Attendance · Office location</h1>
        <p className="text-sm text-fyh-text-secondary">
          Staff can mark present only within the configured radius of this point.
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
