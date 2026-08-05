import { MembershipPackagesList } from '@/src/hair/components/membership-packages/MembershipPackagesUi';
import { listPackagePlans } from '@/src/hair/services/loyaltyOps';

export const dynamic = 'force-dynamic';

/** Configuration catalog — prepaid session packages (scaffold; CRUD follows). */
export default async function MembershipPackagesPage() {
  const packages = await listPackagePlans().catch(() => []);
  return <MembershipPackagesList packages={packages} />;
}
