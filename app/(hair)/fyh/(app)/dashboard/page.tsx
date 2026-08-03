import { redirect } from 'next/navigation';
import {
  requireHairAuthPage,
  resolveDashboardChildPath,
} from '@/src/hair/lib/auth/guards';

export default async function DashboardIndexPage() {
  const admin = await requireHairAuthPage();
  redirect(resolveDashboardChildPath(admin));
}
