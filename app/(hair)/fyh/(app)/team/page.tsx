import { TeamManagementPage } from '@/src/hair/components/team/TeamManagementPage';
import { requireTeamManagementAccess } from '@/src/hair/lib/auth/teamManagementAccess';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import {
  listPendingTeamInvitations,
  listTeamLocations,
  listTeamMembers,
} from '@/src/hair/services/team';

export default async function TeamRoutePage() {
  const access = await requireTeamManagementAccess();
  const ctx = await getTenantContextForPage();
  if (!ctx) return null;

  const [members, invitations, locations] = await Promise.all([
    listTeamMembers(ctx),
    listPendingTeamInvitations(ctx),
    listTeamLocations(ctx),
  ]);

  return (
    <TeamManagementPage
      members={members}
      invitations={invitations}
      locations={locations}
      access={access}
    />
  );
}
