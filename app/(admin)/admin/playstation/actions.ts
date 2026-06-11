'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { isPs4PlanId } from '@/src/lib/playstation/plans';
import {
  activateMembership,
  adminCancelMembership,
  adminDeactivateMembership,
  adminExtendMembership,
  adminManualActivate,
} from '@/src/services/playstationMembership';

export async function adminActivateMembershipAction(formData: FormData) {
  const session = await requireAdminPermission('payments:write');
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!membershipId) throw new Error('Membership id required.');
  await activateMembership(membershipId, session.adminId);
  revalidatePath('/admin/playstation');
}

export async function adminDeactivateMembershipAction(formData: FormData) {
  const session = await requireAdminPermission('payments:write');
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!membershipId) throw new Error('Membership id required.');
  await adminDeactivateMembership(session, membershipId);
  revalidatePath('/admin/playstation');
}

export async function adminCancelMembershipAction(formData: FormData) {
  const session = await requireAdminPermission('payments:write');
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!membershipId) throw new Error('Membership id required.');
  await adminCancelMembership(session, membershipId);
  revalidatePath('/admin/playstation');
}

export async function adminExtendMembershipAction(formData: FormData) {
  const session = await requireAdminPermission('payments:write');
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  const extraDays = Number(formData.get('extraDays') ?? 0);
  if (!membershipId) throw new Error('Membership id required.');
  await adminExtendMembership(session, membershipId, extraDays);
  revalidatePath('/admin/playstation');
}

export async function adminManualActivateAction(formData: FormData) {
  const session = await requireAdminPermission('payments:write');
  const customerId = String(formData.get('customerId') ?? '').trim();
  const pgId = String(formData.get('pgId') ?? '').trim();
  const plan = String(formData.get('plan') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!customerId || !pgId || !isPs4PlanId(plan)) {
    throw new Error('Customer, PG, and plan are required.');
  }
  await adminManualActivate(session, { customerId, pgId, plan, notes: notes || undefined });
  revalidatePath('/admin/playstation');
}
