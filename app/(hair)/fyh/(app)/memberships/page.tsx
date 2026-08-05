import { MembershipsList } from '@/src/hair/components/memberships/MembershipsUi';
import { ensureDefaultMembershipPlans, listMembershipPlans } from '@/src/hair/services/loyaltyOps';

export const dynamic = 'force-dynamic';

/** Configuration catalog — subscription membership plans. */
export default async function MembershipsPage() {
  await ensureDefaultMembershipPlans().catch(() => []);
  const memberships = await listMembershipPlans().catch(() => []);
  return <MembershipsList memberships={memberships} />;
}
