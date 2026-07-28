import { StaffPage } from '@/src/hair/components/staff/StaffUi';
import { listStaff } from '@/src/hair/services/staff';

export default async function StaffRoutePage() {
  const staff = await listStaff(true);
  return <StaffPage staff={staff} />;
}
