import { PackagesList } from '@/src/hair/components/packages/PackagesUi';
import { listPackagePlans } from '@/src/hair/services/loyaltyOps';

export const dynamic = 'force-dynamic';

/** Configuration catalog — service bundles (one-time purchase). */
export default async function PackagesPage() {
  const packages = await listPackagePlans().catch(() => []);
  return <PackagesList packages={packages} />;
}
