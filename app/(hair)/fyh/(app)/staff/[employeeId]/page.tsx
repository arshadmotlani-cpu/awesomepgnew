import { notFound } from 'next/navigation';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { EmployeeProfilePanel } from '@/src/workforce/components/EmployeeProfilePanel';
import { getIncentivePlan } from '@/src/workforce/services/incentivePlans';
import { weekOffDaysFromSchedule } from '@/src/workforce/lib/weekOff';
import { requireStaffManagementAccess } from '@/src/hair/lib/auth/staffManagementAccess';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { hasWorkforcePermission } from '@/src/workforce/permissions/presets';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { isSystemProviderEmployee } from '@/src/workforce/services/systemOwnerProvider';

type Props = {
  params: Promise<{ employeeId: string }>;
};

export default async function EmployeeProfilePage({ params }: Props) {
  if (!isWorkforceEngineEnabled()) notFound();

  const { employeeId } = await params;
  const access = await requireStaffManagementAccess();
  const session = await getHairSession();
  const viewerDash = session?.workforceEmployeeId
    ? await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon')
    : null;

  const dash = await getEmployeeDashboard(employeeId, 'fyh_salon');
  if (!dash?.employee || !dash.membership || !dash.grants) notFound();
  if (isSystemProviderEmployee(dash.employee)) notFound();

  const incentivePlan = await getIncentivePlan(employeeId, 'fyh_salon');
  const weekOffDays = weekOffDaysFromSchedule(dash.schedule);
  const canEdit = hasWorkforcePermission(access.grants, 'staff.edit');
  const canToggleIncentive =
    access.grants === null || viewerDash?.membership?.jobRole === 'owner';

  return (
    <EmployeeProfilePanel
      employee={dash.employee}
      membership={dash.membership}
      grants={dash.grants}
      incentivePlan={incentivePlan}
      weekOffDays={weekOffDays}
      canEdit={canEdit}
      canToggleIncentive={canToggleIncentive}
    />
  );
}
