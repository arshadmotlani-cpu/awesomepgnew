'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import {
  TeamManagementError,
  canAssignTeamRole,
  requireTeamEditAccess,
  requireTeamInviteAccess,
} from '@/src/hair/lib/auth/teamManagementAccess';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import {
  inviteTeamMember,
  updateTeamMember,
} from '@/src/hair/services/team';

export type TeamActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function collectLocationIds(formData: FormData): string[] {
  return formData
    .getAll('locationIds')
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export async function inviteTeamMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  try {
    if (!isFyhSaasTenantEnabled()) return { error: 'Team management requires SaaS tenant mode' };
    const access = await requireTeamInviteAccess();
    const ctx = await getTenantContextForAction();
    if (!ctx || ctx.organizationId !== access.organizationId) {
      return { error: 'Organization context mismatch' };
    }

    const accessRole = formStr(formData, 'accessRole') as PlatformMembershipRole;
    if (!canAssignTeamRole(access.membershipRole, accessRole)) {
      return { error: 'You cannot assign that role' };
    }

    const { token } = await inviteTeamMember({
      ctx,
      email: formStr(formData, 'email'),
      accessRole,
      locationIds: collectLocationIds(formData),
      invitedByUserId: access.userId,
    });

    revalidatePath('/team');
    return {
      success: `Invitation created. Accept link: /platform/auth/accept-invite?token=${token}`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to invite team member',
    };
  }
}

export async function updateTeamMemberAction(formData: FormData): Promise<void> {
  if (!isFyhSaasTenantEnabled()) redirect('/staff');

  try {
    const access = await requireTeamEditAccess();
    const ctx = await getTenantContextForAction();
    if (!ctx || ctx.organizationId !== access.organizationId) {
      throw new TeamManagementError('Organization context mismatch');
    }

    const membershipId = formStr(formData, 'membershipId');
    const accessRole = formStr(formData, 'accessRole') as PlatformMembershipRole;
    const isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true';

    if (!canAssignTeamRole(access.membershipRole, accessRole)) {
      throw new TeamManagementError('You cannot assign that role');
    }
    if (!isActive && !access.canDeactivate) {
      throw new TeamManagementError('Missing permission to deactivate members');
    }
    if (membershipId === access.membershipId && !isActive) {
      throw new TeamManagementError('You cannot deactivate your own membership');
    }

    await updateTeamMember({
      ctx,
      membershipId,
      accessRole,
      locationIds: collectLocationIds(formData),
      isActive,
      fullName: formStr(formData, 'fullName') || null,
      mobile: formStr(formData, 'mobile') || null,
    });

    revalidatePath('/team');
    revalidatePath(`/team/${membershipId}`);
    redirect('/team');
  } catch (error) {
    if (error instanceof TeamManagementError) {
      redirect(`/team/${formStr(formData, 'membershipId')}?error=${encodeURIComponent(error.message)}`);
    }
    redirect('/team?error=update_failed');
  }
}
