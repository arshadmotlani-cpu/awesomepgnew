'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePlatformAdminPage } from '@/src/platform/lib/auth/guards';
import {
  acceptInvitation,
  createMemberInvitation,
  createOrganizationLocation,
  createOrganizationWithOwnerInvite,
  setPlatformAdminMembership,
  setPlatformUserStatus,
  updateMemberAccess,
  updateOrganizationBasics,
  updateOrganizationLocation,
  updateOrganizationStatus,
  updateSubscription,
  upsertPlatformPlan,
} from '@/src/platform/services/admin';

function boolFromFormData(value: FormDataEntryValue | null): boolean {
  return value === 'on' || value === 'true' || value === '1';
}

function collectLocationIds(formData: FormData): string[] {
  return formData
    .getAll('locationIds')
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdminPage();
  const { organizationId } = await createOrganizationWithOwnerInvite({
    organizationName: String(formData.get('organizationName') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    businessEmail: String(formData.get('businessEmail') ?? ''),
    firstOwnerName: String(formData.get('firstOwnerName') ?? ''),
    firstOwnerEmail: String(formData.get('firstOwnerEmail') ?? ''),
    firstOwnerPhone: String(formData.get('firstOwnerPhone') ?? ''),
    defaultTimezone: String(formData.get('defaultTimezone') ?? ''),
    gstin: String(formData.get('gstin') ?? ''),
    primaryLocationName: String(formData.get('primaryLocationName') ?? ''),
    primaryLocationAddress: String(formData.get('primaryLocationAddress') ?? ''),
    planId: String(formData.get('planId') ?? ''),
    subscriptionStatus: String(formData.get('subscriptionStatus') ?? 'trial') as
      | 'trial'
      | 'active'
      | 'past_due'
      | 'suspended'
      | 'cancelled',
    trialEndsAt: String(formData.get('trialEndsAt') ?? ''),
    invoicePrefix: String(formData.get('invoicePrefix') ?? ''),
    actorUserId: session.userId,
  });

  revalidatePath('/platform/admin');
  revalidatePath('/platform/admin/organizations');
  redirect(`/platform/admin/organizations/${organizationId}`);
}

export async function savePlanAction(formData: FormData): Promise<void> {
  await requirePlatformAdminPage();
  await upsertPlatformPlan({
    id: String(formData.get('id') ?? '').trim() || undefined,
    slug: String(formData.get('slug') ?? ''),
    name: String(formData.get('name') ?? ''),
    limitsJson: String(formData.get('limitsJson') ?? ''),
  });
  revalidatePath('/platform/admin/plans');
  redirect('/platform/admin/plans');
}

export async function updateOrganizationAction(formData: FormData): Promise<void> {
  await requirePlatformAdminPage();
  const organizationId = String(formData.get('organizationId') ?? '');
  await updateOrganizationBasics({
    organizationId,
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    defaultTimezone: String(formData.get('defaultTimezone') ?? ''),
    gstin: String(formData.get('gstin') ?? ''),
  });
  revalidatePath(`/platform/admin/organizations/${organizationId}`);
  revalidatePath('/platform/admin/organizations');
}

export async function updateOrganizationStatusAction(formData: FormData): Promise<void> {
  await requirePlatformAdminPage();
  const organizationId = String(formData.get('organizationId') ?? '');
  const status = String(formData.get('status') ?? 'active') as 'active' | 'trial' | 'suspended';
  await updateOrganizationStatus(organizationId, status);
  revalidatePath('/platform/admin');
  revalidatePath('/platform/admin/organizations');
  revalidatePath(`/platform/admin/organizations/${organizationId}`);
}

export async function createLocationAction(formData: FormData): Promise<void> {
  await requirePlatformAdminPage();
  const organizationId = String(formData.get('organizationId') ?? '');
  await createOrganizationLocation({
    organizationId,
    name: String(formData.get('name') ?? ''),
    address: String(formData.get('address') ?? ''),
    isPrimary: boolFromFormData(formData.get('isPrimary')),
  });
  revalidatePath(`/platform/admin/organizations/${organizationId}`);
  revalidatePath(`/platform/admin/organizations/${organizationId}/locations`);
}

export async function updateLocationAction(formData: FormData): Promise<void> {
  await requirePlatformAdminPage();
  const organizationId = String(formData.get('organizationId') ?? '');
  await updateOrganizationLocation({
    locationId: String(formData.get('locationId') ?? ''),
    name: String(formData.get('name') ?? ''),
    address: String(formData.get('address') ?? ''),
    status: String(formData.get('status') ?? 'active') as 'active' | 'inactive',
  });
  revalidatePath(`/platform/admin/organizations/${organizationId}`);
  revalidatePath(`/platform/admin/organizations/${organizationId}/locations`);
}

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdminPage();
  const organizationId = String(formData.get('organizationId') ?? '');
  await createMemberInvitation({
    organizationId,
    email: String(formData.get('email') ?? ''),
    accessRole: String(formData.get('accessRole') ?? 'staff') as
      | 'owner'
      | 'co_owner'
      | 'manager'
      | 'biller'
      | 'staff',
    locationIds: collectLocationIds(formData),
    invitedByUserId: session.userId,
  });
  revalidatePath(`/platform/admin/organizations/${organizationId}`);
  revalidatePath(`/platform/admin/organizations/${organizationId}/members`);
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  await requirePlatformAdminPage();
  const organizationId = String(formData.get('organizationId') ?? '');
  await updateMemberAccess({
    membershipId: String(formData.get('membershipId') ?? ''),
    accessRole: String(formData.get('accessRole') ?? 'staff') as
      | 'owner'
      | 'co_owner'
      | 'manager'
      | 'biller'
      | 'staff',
    locationIds: collectLocationIds(formData),
    isActive: boolFromFormData(formData.get('isActive')),
  });
  revalidatePath(`/platform/admin/organizations/${organizationId}`);
  revalidatePath(`/platform/admin/organizations/${organizationId}/members`);
}

export async function updateSubscriptionAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdminPage();
  const organizationId = String(formData.get('organizationId') ?? '');
  await updateSubscription({
    organizationId,
    planId: String(formData.get('planId') ?? ''),
    status: String(formData.get('status') ?? 'trial') as
      | 'trial'
      | 'active'
      | 'past_due'
      | 'suspended'
      | 'cancelled',
    currentPeriodEnd: String(formData.get('currentPeriodEnd') ?? ''),
    actorUserId: session.userId,
  });
  revalidatePath('/platform/admin');
  revalidatePath('/platform/admin/subscriptions');
  revalidatePath(`/platform/admin/organizations/${organizationId}`);
}

export async function updatePlatformUserAction(formData: FormData): Promise<void> {
  await requirePlatformAdminPage();
  const userId = String(formData.get('userId') ?? '');
  await setPlatformUserStatus(
    userId,
    String(formData.get('status') ?? 'active') as 'active' | 'suspended' | 'invited',
  );
  await setPlatformAdminMembership(userId, boolFromFormData(formData.get('isPlatformAdmin')));
  revalidatePath('/platform/admin/users');
}

export type AcceptInviteState = { error?: string };

export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  try {
    await acceptInvitation({
      token: String(formData.get('token') ?? ''),
      fullName: String(formData.get('fullName') ?? ''),
      mobile: String(formData.get('mobile') ?? ''),
      password: String(formData.get('password') ?? ''),
    });
    redirect('/platform/auth/login');
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not accept invitation' };
  }
}
