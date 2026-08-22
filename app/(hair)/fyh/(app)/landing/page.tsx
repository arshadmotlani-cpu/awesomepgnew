import { redirect } from 'next/navigation';
import { requireHairAuthPage, resolveDefaultLandingPath } from '@/src/hair/lib/auth/guards';

export default async function LandingPage() {
  const admin = await requireHairAuthPage();
  redirect(resolveDefaultLandingPath(admin));
}
