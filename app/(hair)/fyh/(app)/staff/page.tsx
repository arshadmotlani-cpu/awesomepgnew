import { StaffPage } from '@/src/hair/components/staff/StaffUi';
import { listStaff } from '@/src/hair/services/staff';
import { listSchedulesForStaff } from '@/src/hair/services/staffSchedules';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { redirect } from 'next/navigation';

export default async function StaffRoutePage() {
  if (isWorkforceEngineEnabled()) {
    redirect('/workforce');
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
