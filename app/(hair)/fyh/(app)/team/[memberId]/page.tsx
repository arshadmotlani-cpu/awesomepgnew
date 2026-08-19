import { notFound } from 'next/navigation';
import { TeamMemberEditor } from '@/src/hair/components/team/TeamMemberEditor';
import { requireTeamManagementAccess } from '@/src/hair/lib/auth/teamManagementAccess';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import {
  getTeamMember,
  listTeamLocations,
} from '@/src/hair/services/team';

type Props = {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function TeamMemberRoutePage({ params, searchParams }: Props) {
  const access = await requireTeamManagementAccess();
  if (!access.canEdit) notFound();

  const { memberId } = await params;
  const { error } = await searchParams;
  const ctx = await getTenantContextForPage();
  if (!ctx) return null;

  const [member, locations] = await Promise.all([
    getTeamMember(ctx, memberId),
    listTeamLocations(ctx),
  ]);
  if (!member) notFound();

  return (
    <TeamMemberEditor
      member={member}
      locations={locations}
      access={access}
      error={error}
    />
  );
}
