import { listOwnerPgOptions } from '@/src/owner/services/pgOptions';
import { PropertyFormUi } from '@/src/owner/components/wealth/PropertyFormUi';

export default async function OwnerPropertyNewPage() {
  const pgOptions = await listOwnerPgOptions().catch(() => []);
  return <PropertyFormUi pgOptions={pgOptions} />;
}
