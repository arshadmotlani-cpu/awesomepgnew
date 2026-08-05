import { StaffPage } from '@/src/hair/components/staff/StaffUi';
import { requireStaffManagementAccess } from '@/src/hair/lib/auth/staffManagementAccess';
import { listStaff } from '@/src/hair/services/staff';
import { listSchedulesForStaff } from '@/src/hair/services/staffSchedules';
import { StaffManagementList } from '@/src/workforce/components/StaffManagementList';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export default async function StaffRoutePage() {
  if (isWorkforceEngineEnabled()) {
    const access = await requireStaffManagementAccess();
    return <StaffManagementList canAdd={access.canAdd} grants={access.grants} />;
  }

  const staff = await listStaff(true);
  const schedulesByStaffId: Record<
    string,
    Awaited<ReturnType<typeof listSchedulesForStaff>>
  > = {};
  await Promise.all(
    staff.map(async (s) => {
      schedulesByStaffId[s.id] = await listSchedulesForStaff(s.id);
    }),
  );
  return <StaffPage staff={staff} schedulesByStaffId={schedulesByStaffId} />;
}
