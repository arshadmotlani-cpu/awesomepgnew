import { StaffPage } from '@/src/hair/components/staff/StaffUi';
import { listStaff } from '@/src/hair/services/staff';
import { listSchedulesForStaff } from '@/src/hair/services/staffSchedules';

export default async function StaffRoutePage() {
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
