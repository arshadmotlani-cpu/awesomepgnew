import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { hashPassword, randomToken } from '@/src/lib/auth/crypto';
import { hairDb } from '@/src/hair/db/client';
import { fyhSettings } from '@/src/hair/db/schema/settings';
import { fyhOrgCustomerSequences, fyhOrgInvoiceSequences } from '@/src/hair/db/schema/saas';
import { wfEmployees, wfEngineMemberships } from '@/src/workforce/db/schema';
import { createPlatformClient } from '@/src/platform/db/client';
import {
  platformInvitations,
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformMembershipsSuper,
  platformOrganizations,
  platformOrganizationEntitlements,
  platformOrganizationSubscriptions,
  platformPlans,
  platformSubscriptionEvents,
  platformUsers,
  type PlatformMembershipRole,
  type PlatformOrgStatus,
  type PlatformSubscriptionStatus,
  type PlatformUserStatus,
} from '@/src/platform/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { allocateUniqueOrgSlug } from '@/src/platform/lib/orgSlug';
import {
  customSalonAnnualPlanLimits,
  isOrganizationCustomPlanSlug,
  organizationCustomPlanSlug,
  STANDARD_SALON_PLAN_SLUGS,
  STANDARD_SALON_PRICE_PAISE,
} from '@/src/platform/lib/salonSubscriptionPricing';
import {
  asPlatformSubscriptionStatus,
  formatTrialAdminLabel,
  resolveCreateSubscriptionPeriod,
} from '@/src/platform/lib/subscriptionTrial';
import { resolveAmountPaiseFromPlanLimits } from '@/src/platform/services/manualSubscriptionPayments';

type OrgStatus = PlatformOrgStatus;

export type PlatformDashboardStats = {
  totalOrganizations: number;
  activeOrganizations: number;
  trialOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  totalLocations: number;
  totalPlans: number;
  subscriptionsByStatus: Record<string, number>;
  recentOrganizations: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: Date;
    ownerEmail: string | null;
    planName: string | null;
    locationCount: number;
    memberCount: number;
    subscriptionStatus: PlatformSubscriptionStatus | null;
  }>;
  recentSubscriptionActivity: Array<{
    id: string;
    organizationName: string;
    eventType: string;
    detail: string | null;
    createdAt: Date;
  }>;
};

export type PlatformPlanRecord = typeof platformPlans.$inferSelect;
export type PlatformUserRecord = typeof platformUsers.$inferSelect & { isPlatformAdmin: boolean };
export type PlatformInvitationRecord = typeof platformInvitations.$inferSelect;
export type PlatformLocationRecord = typeof platformLocations.$inferSelect;
export type PlatformMembershipRecord = typeof platformMemberships.$inferSelect & {
  email: string;
  organizationName: string;
};

export type OrganizationDetail = typeof platformOrganizations.$inferSelect & {
  locations: PlatformLocationRecord[];
  members: PlatformMembershipRecord[];
  invitations: PlatformInvitationRecord[];
  subscription:
    | (typeof platformOrganizationSubscriptions.$inferSelect & {
        planName: string | null;
        planSlug: string | null;
        /** Derived from plan limits, not a subscription column. Null when limits are unparseable. */
        amountPaise: number | null;
        isCustomAnnualPrice: boolean;
      })
    | null;
  entitlements: Array<typeof platformOrganizationEntitlements.$inferSelect>;
};

export type CreateOrganizationInput = {
  organizationName: string;
  /** Ignored when present — slug is derived from organizationName server-side. */
  slug?: string;
  businessEmail: string;
  firstOwnerName: string;
  firstOwnerEmail: string;
  firstOwnerPhone?: string | null;
  defaultTimezone?: string | null;
  gstin?: string | null;
  primaryLocationName: string;
  primaryLocationAddress?: string | null;
  planId: string;
  subscriptionStatus: PlatformSubscriptionStatus;
  trialEndsAt?: string | null;
  invoicePrefix?: string | null;
  entitlements?: Record<string, number | null>;
  actorUserId: string;
};

export type InviteMemberInput = {
  organizationId: string;
  email: string;
  accessRole: PlatformMembershipRole;
  locationIds: string[];
  invitedByUserId: string;
  expiresInDays?: number;
};

export type PlatformOrganizationListItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  locationCount: number;
  memberCount: number;
  planName: string | null;
  planId: string | null;
  subscriptionStatus: PlatformSubscriptionStatus | null;
  subscriptionCurrentPeriodEnd: Date | null;
  trialLabel: string | null;
  ownerEmail: string | null;
  createdAt: Date;
};

export type OrganizationAttentionItem = {
  organizationId: string;
  organizationName: string;
  slug: string;
  reason: string;
  severity: 'warning' | 'critical';
};

export type PlatformLocationListItem = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  status: string;
  isPrimary: boolean;
  address: string | null;
  createdAt: Date;
};

export type PlatformSearchResult = {
  type: 'organization' | 'user';
  id: string;
  label: string;
  sublabel: string;
  href: string;
};

type PlatformDb = ReturnType<typeof createPlatformClient>['db'];

async function enrichOrganizationSummaries(
  db: PlatformDb,
  orgs: Array<typeof platformOrganizations.$inferSelect>,
) {
  const results = [];
  for (const org of orgs) {
    const locRows = await db
      .select({ id: platformLocations.id })
      .from(platformLocations)
      .where(eq(platformLocations.organizationId, org.id));
    const memberRows = await db
      .select({ id: platformMemberships.id })
      .from(platformMemberships)
      .where(eq(platformMemberships.organizationId, org.id));
    const [sub] = await db
      .select({
        planId: platformOrganizationSubscriptions.planId,
        planName: platformPlans.name,
        status: platformOrganizationSubscriptions.status,
        currentPeriodEnd: platformOrganizationSubscriptions.currentPeriodEnd,
      })
      .from(platformOrganizationSubscriptions)
      .innerJoin(platformPlans, eq(platformOrganizationSubscriptions.planId, platformPlans.id))
      .where(eq(platformOrganizationSubscriptions.organizationId, org.id))
      .limit(1);
    const [owner] = await db
      .select({ email: platformUsers.email })
      .from(platformMemberships)
      .innerJoin(platformUsers, eq(platformMemberships.userId, platformUsers.id))
      .where(
        and(
          eq(platformMemberships.organizationId, org.id),
          eq(platformMemberships.accessRole, 'owner'),
        ),
      )
      .limit(1);
    results.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      createdAt: org.createdAt,
      ownerEmail: owner?.email ?? null,
      planName: sub?.planName ?? null,
      planId: sub?.planId ?? null,
      locationCount: locRows.length,
      memberCount: memberRows.length,
      subscriptionStatus: sub?.status ?? null,
      subscriptionCurrentPeriodEnd: sub?.currentPeriodEnd ?? null,
      trialLabel: formatTrialAdminLabel(sub?.status ?? null, sub?.currentPeriodEnd ?? null),
    });
  }
  return results;
}

export async function getPlatformDashboardStats(): Promise<PlatformDashboardStats> {
  if (!hasPlatformDatabaseUrl()) {
    return {
      totalOrganizations: 0,
      activeOrganizations: 0,
      trialOrganizations: 0,
      suspendedOrganizations: 0,
      totalUsers: 0,
      totalLocations: 0,
      totalPlans: 0,
      subscriptionsByStatus: {},
      recentOrganizations: [],
      recentSubscriptionActivity: [],
    };
  }

  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [orgCounts, userCount, locationCount, planCount, orgs, events, subs] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${platformOrganizations.status} = 'active')::int`,
          trial: sql<number>`count(*) filter (where ${platformOrganizations.status} = 'trial')::int`,
          suspended: sql<number>`count(*) filter (where ${platformOrganizations.status} = 'suspended')::int`,
        })
        .from(platformOrganizations),
      db.select({ total: sql<number>`count(*)::int` }).from(platformUsers),
      db.select({ total: sql<number>`count(*)::int` }).from(platformLocations),
      db.select({ total: sql<number>`count(*)::int` }).from(platformPlans),
      db
        .select()
        .from(platformOrganizations)
        .orderBy(desc(platformOrganizations.createdAt))
        .limit(8),
      db
        .select({
          id: platformSubscriptionEvents.id,
          organizationName: platformOrganizations.name,
          eventType: platformSubscriptionEvents.eventType,
          detail: platformSubscriptionEvents.detail,
          createdAt: platformSubscriptionEvents.createdAt,
        })
        .from(platformSubscriptionEvents)
        .innerJoin(
          platformOrganizations,
          eq(platformSubscriptionEvents.organizationId, platformOrganizations.id),
        )
        .orderBy(desc(platformSubscriptionEvents.createdAt))
        .limit(10),
      db
        .select({
          status: platformOrganizationSubscriptions.status,
          total: sql<number>`count(*)::int`,
        })
        .from(platformOrganizationSubscriptions)
        .groupBy(platformOrganizationSubscriptions.status),
    ]);

    return {
      totalOrganizations: Number(orgCounts[0]?.total ?? 0),
      activeOrganizations: Number(orgCounts[0]?.active ?? 0),
      trialOrganizations: Number(orgCounts[0]?.trial ?? 0),
      suspendedOrganizations: Number(orgCounts[0]?.suspended ?? 0),
      totalUsers: Number(userCount[0]?.total ?? 0),
      totalLocations: Number(locationCount[0]?.total ?? 0),
      totalPlans: Number(planCount[0]?.total ?? 0),
      subscriptionsByStatus: Object.fromEntries(subs.map((row) => [row.status, Number(row.total)])),
      recentOrganizations: await enrichOrganizationSummaries(db, orgs),
      recentSubscriptionActivity: events,
    };
  } finally {
    await close();
  }
}

export async function listPlatformPlans(): Promise<PlatformPlanRecord[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    return await db.select().from(platformPlans).orderBy(platformPlans.name);
  } finally {
    await close();
  }
}

export async function upsertPlatformPlan(input: {
  id?: string;
  slug: string;
  name: string;
  limitsJson?: string;
}): Promise<string> {
  const limits = safeJson(input.limitsJson);
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    if (input.id) {
      await db
        .update(platformPlans)
        .set({ slug: normalizeSlug(input.slug), name: input.name.trim(), limits })
        .where(eq(platformPlans.id, input.id));
      return input.id;
    }
    const [row] = await db
      .insert(platformPlans)
      .values({
        slug: normalizeSlug(input.slug),
        name: input.name.trim(),
        limits,
      })
      .returning({ id: platformPlans.id });
    if (!row) throw new Error('Failed to create plan');
    return row.id;
  } finally {
    await close();
  }
}

export async function listPlatformUsers(): Promise<PlatformUserRecord[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const users = await db.select().from(platformUsers).orderBy(platformUsers.createdAt);
    const admins = await db.select().from(platformMembershipsSuper);
    const adminIds = new Set(admins.map((row) => row.userId));
    return users.map((user) => ({ ...user, isPlatformAdmin: adminIds.has(user.id) }));
  } finally {
    await close();
  }
}

export async function setPlatformUserStatus(userId: string, status: PlatformUserStatus): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db
      .update(platformUsers)
      .set({ status, updatedAt: new Date() })
      .where(eq(platformUsers.id, userId));
  } finally {
    await close();
  }
}

export async function setPlatformAdminMembership(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [existing] = await db
      .select()
      .from(platformMembershipsSuper)
      .where(eq(platformMembershipsSuper.userId, userId))
      .limit(1);
    if (enabled && !existing) {
      await db.insert(platformMembershipsSuper).values({ userId, role: 'admin' });
    }
    if (!enabled && existing) {
      await db.delete(platformMembershipsSuper).where(eq(platformMembershipsSuper.id, existing.id));
    }
  } finally {
    await close();
  }
}

export async function listOrganizationDetailsForAdmin(
  organizationId: string,
): Promise<OrganizationDetail | null> {
  if (!hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [org] = await db
      .select()
      .from(platformOrganizations)
      .where(eq(platformOrganizations.id, organizationId))
      .limit(1);
    if (!org) return null;

    const [locations, memberRows, invitations, entitlements, subRows] = await Promise.all([
      db.select().from(platformLocations).where(eq(platformLocations.organizationId, organizationId)),
      db
        .select({
          id: platformMemberships.id,
          userId: platformMemberships.userId,
          organizationId: platformMemberships.organizationId,
          role: platformMemberships.role,
          accessRole: platformMemberships.accessRole,
          isActive: platformMemberships.isActive,
          createdAt: platformMemberships.createdAt,
          updatedAt: platformMemberships.updatedAt,
          email: platformUsers.email,
          organizationName: platformOrganizations.name,
        })
        .from(platformMemberships)
        .innerJoin(platformUsers, eq(platformMemberships.userId, platformUsers.id))
        .innerJoin(platformOrganizations, eq(platformMemberships.organizationId, platformOrganizations.id))
        .where(eq(platformMemberships.organizationId, organizationId)),
      db
        .select()
        .from(platformInvitations)
        .where(eq(platformInvitations.organizationId, organizationId))
        .orderBy(desc(platformInvitations.createdAt)),
      db
        .select()
        .from(platformOrganizationEntitlements)
        .where(eq(platformOrganizationEntitlements.organizationId, organizationId)),
      db
        .select({
          id: platformOrganizationSubscriptions.id,
          organizationId: platformOrganizationSubscriptions.organizationId,
          planId: platformOrganizationSubscriptions.planId,
          status: platformOrganizationSubscriptions.status,
          currentPeriodStart: platformOrganizationSubscriptions.currentPeriodStart,
          currentPeriodEnd: platformOrganizationSubscriptions.currentPeriodEnd,
          createdAt: platformOrganizationSubscriptions.createdAt,
          updatedAt: platformOrganizationSubscriptions.updatedAt,
          stripeCustomerId: platformOrganizationSubscriptions.stripeCustomerId,
          stripeSubscriptionId: platformOrganizationSubscriptions.stripeSubscriptionId,
          stripePriceId: platformOrganizationSubscriptions.stripePriceId,
          planName: platformPlans.name,
          planSlug: platformPlans.slug,
          planLimits: platformPlans.limits,
        })
        .from(platformOrganizationSubscriptions)
        .leftJoin(platformPlans, eq(platformOrganizationSubscriptions.planId, platformPlans.id))
        .where(eq(platformOrganizationSubscriptions.organizationId, organizationId))
        .orderBy(desc(platformOrganizationSubscriptions.updatedAt))
        .limit(1),
    ]);

    const sub = subRows[0] ?? null;
    let amountPaise: number | null = null;
    if (sub?.planLimits) {
      try {
        amountPaise = resolveAmountPaiseFromPlanLimits(
          (sub.planLimits as Record<string, unknown>) ?? {},
        );
      } catch {
        amountPaise = null;
      }
    }

    return {
      ...org,
      locations,
      members: memberRows,
      invitations,
      entitlements,
      subscription: sub
        ? {
            id: sub.id,
            organizationId: sub.organizationId,
            planId: sub.planId,
            status: sub.status,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            createdAt: sub.createdAt,
            updatedAt: sub.updatedAt,
            stripeCustomerId: sub.stripeCustomerId,
            stripeSubscriptionId: sub.stripeSubscriptionId,
            stripePriceId: sub.stripePriceId,
            planName: sub.planName,
            planSlug: sub.planSlug,
            amountPaise,
            isCustomAnnualPrice: isOrganizationCustomPlanSlug(sub.planSlug),
          }
        : null,
    };
  } finally {
    await close();
  }
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeJson(raw?: string): Record<string, unknown> {
  const text = raw?.trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Limits JSON must be an object');
  }
  return parsed as Record<string, unknown>;
}

function entitlementRows(
  organizationId: string,
  limits: Record<string, unknown>,
  overrides?: Record<string, number | null>,
) {
  const entries = Object.entries({ ...limits, ...(overrides ?? {}) })
    .filter(([, value]) => value === null || typeof value === 'number')
    .map(([featureKey, value]) => ({
      organizationId,
      featureKey,
      limit: value === null ? null : Math.round(value as number),
    }));
  return entries;
}

async function provisionHairOrganization(input: {
  organizationId: string;
  businessName: string;
  businessEmail?: string | null;
  timezone: string;
  gstin?: string | null;
  invoicePrefix?: string | null;
}) {
  const [existingSettings] = await hairDb
    .select({ id: fyhSettings.id })
    .from(fyhSettings)
    .where(eq(fyhSettings.organizationId, input.organizationId))
    .limit(1);
  if (!existingSettings) {
    await hairDb.insert(fyhSettings).values({
      organizationId: input.organizationId,
      businessName: input.businessName,
      timezone: input.timezone,
      gstin: input.gstin?.trim() || null,
      invoicePrefix: input.invoicePrefix?.trim().toUpperCase() || 'FYH',
      billingSettings: input.businessEmail?.trim()
        ? { businessEmail: input.businessEmail.trim().toLowerCase() }
        : undefined,
    });
  }

  await hairDb
    .insert(fyhOrgInvoiceSequences)
    .values({
      organizationId: input.organizationId,
      prefix: input.invoicePrefix?.trim().toUpperCase() || 'FYH',
      nextSeq: 1,
    })
    .onConflictDoNothing();

  await hairDb
    .insert(fyhOrgCustomerSequences)
    .values({
      organizationId: input.organizationId,
      nextSeq: 1,
    })
    .onConflictDoNothing();
}

async function ensureHairLoginEmployee(args: {
  organizationId: string;
  userId: string;
  fullName: string;
  email: string;
  mobile?: string | null;
  passwordHash: string | null;
  accessRole: PlatformMembershipRole;
}) {
  const [employee] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.userId, args.userId))
    .limit(1);

  let employeeId = employee?.id ?? randomUUID();
  if (!employee) {
    await hairDb.insert(wfEmployees).values({
      id: employeeId,
      organizationId: args.organizationId,
      userId: args.userId,
      fullName: args.fullName,
      email: args.email,
      mobile: args.mobile?.trim() || null,
      passwordHash: args.passwordHash,
      canLogin: true,
      status: 'active',
    });
  } else {
    await hairDb
      .update(wfEmployees)
      .set({
        organizationId: args.organizationId,
        fullName: args.fullName,
        email: args.email,
        mobile: args.mobile?.trim() || null,
        passwordHash: args.passwordHash ?? employee.passwordHash,
        canLogin: true,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(wfEmployees.id, employee.id));
    employeeId = employee.id;
  }

  const [engineMembership] = await hairDb
    .select()
    .from(wfEngineMemberships)
    .where(eq(wfEngineMemberships.employeeId, employeeId))
    .limit(1);

  const jobRole = args.accessRole === 'co_owner' ? 'owner' : args.accessRole;
  const rank = args.accessRole === 'owner' || args.accessRole === 'co_owner' ? 'owner' : args.accessRole === 'manager' ? 'manager' : 'team_member';

  if (!engineMembership) {
    await hairDb.insert(wfEngineMemberships).values({
      organizationId: args.organizationId,
      employeeId,
      engineId: 'fyh_salon',
      rank,
      jobRole,
      isActive: true,
    });
  } else {
    await hairDb
      .update(wfEngineMemberships)
      .set({
        organizationId: args.organizationId,
        rank,
        jobRole,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(wfEngineMemberships.id, engineMembership.id));
  }
}

async function logSubscriptionEvent(input: {
  organizationId: string;
  subscriptionId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  detail?: string | null;
}) {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db.insert(platformSubscriptionEvents).values({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      detail: input.detail ?? null,
    });
  } finally {
    await close();
  }
}

export async function createOrganizationWithOwnerInvite(
  input: CreateOrganizationInput,
): Promise<{ organizationId: string; invitationToken: string }> {
  const timezone = input.defaultTimezone?.trim() || 'Asia/Kolkata';
  const subscriptionStatus = asPlatformSubscriptionStatus(input.subscriptionStatus);
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const subscriptionId = randomUUID();
  const invitationToken = randomToken(24);
  const invitationId = randomUUID();

  await provisionHairOrganization({
    organizationId,
    businessName: input.organizationName.trim(),
    businessEmail: input.businessEmail.trim().toLowerCase(),
    timezone,
    gstin: input.gstin,
    invoicePrefix: input.invoicePrefix,
  });

  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const slug = await allocateUniqueOrgSlug({
      salonName: input.organizationName,
      isTaken: async (candidate) => {
        const [existing] = await db
          .select({ id: platformOrganizations.id })
          .from(platformOrganizations)
          .where(eq(platformOrganizations.slug, candidate))
          .limit(1);
        return Boolean(existing);
      },
    });

    const [plan] = await db.select().from(platformPlans).where(eq(platformPlans.id, input.planId)).limit(1);
    if (!plan) throw new Error('Plan not found');

    const subscriptionPeriod = resolveCreateSubscriptionPeriod({
      subscriptionStatus,
      trialEndsAt: input.trialEndsAt,
    });

    await db.transaction(async (tx) => {
      await tx.insert(platformOrganizations).values({
        id: organizationId,
        slug,
        name: input.organizationName.trim(),
        status: subscriptionStatus === 'trial' ? 'trial' : 'active',
        defaultTimezone: timezone,
        gstin: input.gstin?.trim() || null,
      });
      await tx.insert(platformLocations).values({
        id: locationId,
        organizationId,
        name: input.primaryLocationName.trim(),
        address: input.primaryLocationAddress?.trim() || null,
        isPrimary: true,
        status: 'active',
      });
      await tx.insert(platformUsers).values({
        id: userId,
        email: input.firstOwnerEmail.trim().toLowerCase(),
        status: 'invited',
      });
      await tx.insert(platformMemberships).values({
        id: membershipId,
        userId,
        organizationId,
        role: 'owner',
        accessRole: 'owner',
        isActive: true,
      });
      await tx.insert(platformMembershipLocations).values({
        membershipId,
        locationId,
      });
      await tx.insert(platformOrganizationSubscriptions).values({
        id: subscriptionId,
        organizationId,
        planId: plan.id,
        status: subscriptionStatus,
        currentPeriodStart: subscriptionPeriod.currentPeriodStart,
        currentPeriodEnd: subscriptionPeriod.currentPeriodEnd,
      });
      const entitlements = entitlementRows(
        organizationId,
        (plan.limits as Record<string, unknown>) ?? {},
        input.entitlements,
      );
      if (entitlements.length > 0) {
        await tx.insert(platformOrganizationEntitlements).values(entitlements);
      }
      await tx.insert(platformInvitations).values({
        id: invitationId,
        email: input.firstOwnerEmail.trim().toLowerCase(),
        token: invitationToken,
        organizationId,
        invitedByUserId: input.actorUserId,
        accessRole: 'owner',
        locationIds: [locationId],
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });
  } finally {
    await close();
  }

  await ensureHairLoginEmployee({
    organizationId,
    userId,
    fullName: input.firstOwnerName.trim(),
    email: input.firstOwnerEmail.trim().toLowerCase(),
    mobile: input.firstOwnerPhone,
    passwordHash: null,
    accessRole: 'owner',
  });

  await logSubscriptionEvent({
    organizationId,
    subscriptionId,
    actorUserId: input.actorUserId,
    eventType: 'organization_created',
    detail: `${input.organizationName.trim()} created on ${subscriptionStatus} plan`,
  });

  return { organizationId, invitationToken };
}

export async function createMemberInvitation(
  input: InviteMemberInput,
): Promise<{ invitationId: string; token: string }> {
  const token = randomToken(24);
  const invitationId = randomUUID();
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db.insert(platformInvitations).values({
      id: invitationId,
      email: input.email.trim().toLowerCase(),
      token,
      organizationId: input.organizationId,
      invitedByUserId: input.invitedByUserId,
      accessRole: input.accessRole,
      locationIds: input.locationIds,
      status: 'pending',
      expiresAt: new Date(
        Date.now() + Math.max(1, input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000,
      ),
    });
    return { invitationId, token };
  } finally {
    await close();
  }
}

export async function acceptInvitation(input: {
  token: string;
  fullName: string;
  mobile?: string | null;
  password: string;
}): Promise<{ userId: string; organizationId: string | null }> {
  const token = input.token.trim();
  if (!token) throw new Error('Invitation token is required');
  const passwordHash = hashPassword(input.password);
  const { db, close } = createPlatformClient({ max: 1 });
  let acceptedUserId: string | null = null;
  let acceptedOrganizationId: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(platformInvitations)
        .where(eq(platformInvitations.token, token))
        .limit(1);
      if (!invite) throw new Error('Invitation not found');
      if (invite.status !== 'pending') throw new Error('Invitation is no longer active');
      if (invite.expiresAt.getTime() < Date.now()) throw new Error('Invitation has expired');

      const email = invite.email.trim().toLowerCase();
      let [user] = await tx.select().from(platformUsers).where(eq(platformUsers.email, email)).limit(1);
      if (!user) {
        const [created] = await tx
          .insert(platformUsers)
          .values({
            email,
            passwordHash,
            status: 'active',
          })
          .returning();
        user = created!;
      } else {
        const [updated] = await tx
          .update(platformUsers)
          .set({
            passwordHash,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(platformUsers.id, user.id))
          .returning();
        user = updated!;
      }

      if (invite.organizationId) {
        const [membership] = await tx
          .select()
          .from(platformMemberships)
          .where(
            and(
              eq(platformMemberships.userId, user.id),
              eq(platformMemberships.organizationId, invite.organizationId),
            ),
          )
          .limit(1);
        const membershipId = membership?.id ?? randomUUID();
        if (!membership) {
          await tx.insert(platformMemberships).values({
            id: membershipId,
            userId: user.id,
            organizationId: invite.organizationId,
            role: invite.accessRole,
            accessRole: invite.accessRole,
            isActive: true,
          });
        } else {
          await tx
            .update(platformMemberships)
            .set({
              role: invite.accessRole,
              accessRole: invite.accessRole,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(platformMemberships.id, membership.id));
        }

        const locationIds = Array.isArray(invite.locationIds) ? invite.locationIds : [];
        const existingLocs = await tx
          .select()
          .from(platformMembershipLocations)
          .where(eq(platformMembershipLocations.membershipId, membershipId));
        const existingSet = new Set(existingLocs.map((row) => row.locationId));
        const newLocs = locationIds
          .filter(Boolean)
          .filter((locationId) => !existingSet.has(locationId))
          .map((locationId) => ({ membershipId, locationId }));
        if (newLocs.length > 0) await tx.insert(platformMembershipLocations).values(newLocs);
      }

      await tx
        .update(platformInvitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(platformInvitations.id, invite.id));

      acceptedUserId = user.id;
      acceptedOrganizationId = invite.organizationId ?? null;

      if (invite.organizationId) {
        await tx.insert(platformSubscriptionEvents).values({
          organizationId: invite.organizationId,
          actorUserId: user.id,
          eventType: 'invitation_accepted',
          detail: `${email} accepted ${invite.accessRole} invitation`,
        });
      }
    });
  } finally {
    await close();
  }

  if (acceptedUserId && acceptedOrganizationId) {
    const { db, close } = createPlatformClient({ max: 1 });
    try {
      const [user] = await db.select().from(platformUsers).where(eq(platformUsers.id, acceptedUserId)).limit(1);
      const [membership] = await db
        .select()
        .from(platformMemberships)
        .where(
          and(
            eq(platformMemberships.userId, acceptedUserId),
            eq(platformMemberships.organizationId, acceptedOrganizationId),
          ),
        )
        .limit(1);
      await ensureHairLoginEmployee({
        organizationId: acceptedOrganizationId,
        userId: acceptedUserId,
        fullName: input.fullName.trim(),
        email: user?.email ?? '',
        mobile: input.mobile,
        passwordHash,
        accessRole: (membership?.accessRole ?? membership?.role ?? 'staff') as PlatformMembershipRole,
      });
    } finally {
      await close();
    }
  }

  if (!acceptedUserId) throw new Error('Invitation acceptance failed');
  return { userId: acceptedUserId, organizationId: acceptedOrganizationId };
}

export async function listPlatformSubscriptions() {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    return await db
      .select({
        id: platformOrganizationSubscriptions.id,
        organizationId: platformOrganizationSubscriptions.organizationId,
        organizationName: platformOrganizations.name,
        planId: platformOrganizationSubscriptions.planId,
        planName: platformPlans.name,
        status: platformOrganizationSubscriptions.status,
        currentPeriodStart: platformOrganizationSubscriptions.currentPeriodStart,
        currentPeriodEnd: platformOrganizationSubscriptions.currentPeriodEnd,
        updatedAt: platformOrganizationSubscriptions.updatedAt,
      })
      .from(platformOrganizationSubscriptions)
      .innerJoin(
        platformOrganizations,
        eq(platformOrganizationSubscriptions.organizationId, platformOrganizations.id),
      )
      .innerJoin(platformPlans, eq(platformOrganizationSubscriptions.planId, platformPlans.id))
      .orderBy(desc(platformOrganizationSubscriptions.updatedAt));
  } finally {
    await close();
  }
}

export async function updateOrganizationStatus(
  organizationId: string,
  status: OrgStatus,
): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db
      .update(platformOrganizations)
      .set({ status, updatedAt: new Date() })
      .where(eq(platformOrganizations.id, organizationId));
  } finally {
    await close();
  }
}

export async function updateOrganizationBasics(input: {
  organizationId: string;
  name: string;
  /** Slug is locked after create — accepted for form compat but ignored. */
  slug?: string;
  defaultTimezone?: string | null;
  gstin?: string | null;
}): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db
      .update(platformOrganizations)
      .set({
        name: input.name.trim(),
        defaultTimezone: input.defaultTimezone?.trim() || 'Asia/Kolkata',
        gstin: input.gstin?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(platformOrganizations.id, input.organizationId));

    await hairDb
      .update(fyhSettings)
      .set({
        businessName: input.name.trim(),
        timezone: input.defaultTimezone?.trim() || 'Asia/Kolkata',
        gstin: input.gstin?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(fyhSettings.organizationId, input.organizationId));
  } finally {
    await close();
  }
}

export async function createOrganizationLocation(input: {
  organizationId: string;
  name: string;
  address?: string | null;
  isPrimary?: boolean;
}): Promise<string> {
  const locationId = randomUUID();
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db.insert(platformLocations).values({
      id: locationId,
      organizationId: input.organizationId,
      name: input.name.trim(),
      address: input.address?.trim() || null,
      isPrimary: Boolean(input.isPrimary),
      status: 'active',
    });
    return locationId;
  } finally {
    await close();
  }
}

export async function updateOrganizationLocation(input: {
  locationId: string;
  name: string;
  address?: string | null;
  status: typeof platformLocations.$inferInsert.status;
}): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db
      .update(platformLocations)
      .set({
        name: input.name.trim(),
        address: input.address?.trim() || null,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(platformLocations.id, input.locationId));
  } finally {
    await close();
  }
}

export async function updateMemberAccess(input: {
  membershipId: string;
  accessRole: PlatformMembershipRole;
  locationIds: string[];
  isActive: boolean;
}): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(platformMemberships)
        .set({
          role: input.accessRole,
          accessRole: input.accessRole,
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(eq(platformMemberships.id, input.membershipId));

      await tx
        .delete(platformMembershipLocations)
        .where(eq(platformMembershipLocations.membershipId, input.membershipId));
      if (input.locationIds.length > 0) {
        await tx.insert(platformMembershipLocations).values(
          input.locationIds.map((locationId) => ({
            membershipId: input.membershipId,
            locationId,
          })),
        );
      }
    });
  } finally {
    await close();
  }
}

export async function updateSubscription(input: {
  organizationId: string;
  planId: string;
  status: PlatformSubscriptionStatus;
  currentPeriodEnd?: string | null;
  actorUserId: string;
}): Promise<void> {
  const status = asPlatformSubscriptionStatus(input.status);
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [existing] = await db
      .select()
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, input.organizationId))
      .limit(1);
    if (existing) {
      await db
        .update(platformOrganizationSubscriptions)
        .set({
          planId: input.planId,
          status,
          currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
          updatedAt: new Date(),
        })
        .where(eq(platformOrganizationSubscriptions.id, existing.id));
      await logSubscriptionEvent({
        organizationId: input.organizationId,
        subscriptionId: existing.id,
        actorUserId: input.actorUserId,
        eventType: 'subscription_updated',
        detail: `Subscription set to ${status}`,
      });
    } else {
      const subscriptionId = randomUUID();
      await db.insert(platformOrganizationSubscriptions).values({
        id: subscriptionId,
        organizationId: input.organizationId,
        planId: input.planId,
        status,
        currentPeriodStart: new Date(),
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
      });
      await logSubscriptionEvent({
        organizationId: input.organizationId,
        subscriptionId,
        actorUserId: input.actorUserId,
        eventType: 'subscription_created',
        detail: `Subscription created as ${status}`,
      });
    }
  } finally {
    await close();
  }
}

/**
 * Set a clickable per-org exclusive annual price (creates/updates org-custom plan + assigns it).
 * Charge path stays plan.limits.amountPaise — no hardcoded rupees in submit.
 */
export async function setOrganizationCustomAnnualPrice(input: {
  organizationId: string;
  yearlyRupees: number;
  actorUserId: string;
}): Promise<{ planId: string; amountPaise: number }> {
  if (!hasPlatformDatabaseUrl()) throw new Error('Platform database is not configured');
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [org] = await db
      .select()
      .from(platformOrganizations)
      .where(eq(platformOrganizations.id, input.organizationId))
      .limit(1);
    if (!org) throw new Error('Organization not found');

    const [subscription] = await db
      .select()
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, input.organizationId))
      .limit(1);
    if (!subscription) throw new Error('Organization has no subscription yet');

    const [currentPlan] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, subscription.planId))
      .limit(1);

    const baseLimits = (currentPlan?.limits as Record<string, unknown>) ?? {};
    const limits = customSalonAnnualPlanLimits(input.yearlyRupees, baseLimits);
    const amountPaise = limits.amountPaise as number;
    const slug = organizationCustomPlanSlug(input.organizationId);
    const name = `${org.name} — custom annual`;

    const [existingCustom] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.slug, slug))
      .limit(1);

    let planId: string;
    if (existingCustom) {
      await db
        .update(platformPlans)
        .set({ name, limits })
        .where(eq(platformPlans.id, existingCustom.id));
      planId = existingCustom.id;
    } else {
      planId = randomUUID();
      await db.insert(platformPlans).values({ id: planId, slug, name, limits });
    }

    await db
      .update(platformOrganizationSubscriptions)
      .set({ planId, updatedAt: new Date() })
      .where(eq(platformOrganizationSubscriptions.id, subscription.id));

    await logSubscriptionEvent({
      organizationId: input.organizationId,
      subscriptionId: subscription.id,
      actorUserId: input.actorUserId,
      eventType: 'custom_annual_price_set',
      detail: `Custom annual price set to ₹${Math.round(input.yearlyRupees).toLocaleString('en-IN')}`,
    });

    return { planId, amountPaise };
  } finally {
    await close();
  }
}

/** Restore org to the standard salon catalog plan (₹6,500/year). */
export async function clearOrganizationCustomAnnualPrice(input: {
  organizationId: string;
  actorUserId: string;
}): Promise<void> {
  if (!hasPlatformDatabaseUrl()) throw new Error('Platform database is not configured');
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [subscription] = await db
      .select()
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, input.organizationId))
      .limit(1);
    if (!subscription) throw new Error('Organization has no subscription yet');

    const preferredSlugs = [...STANDARD_SALON_PLAN_SLUGS];
    let standardPlan:
      | { id: string; slug: string }
      | undefined;
    for (const slug of preferredSlugs) {
      const [row] = await db
        .select({ id: platformPlans.id, slug: platformPlans.slug })
        .from(platformPlans)
        .where(eq(platformPlans.slug, slug))
        .limit(1);
      if (row) {
        standardPlan = row;
        break;
      }
    }
    if (!standardPlan) {
      const [fallback] = await db
        .select({ id: platformPlans.id, slug: platformPlans.slug })
        .from(platformPlans)
        .limit(1);
      if (!fallback) throw new Error('No standard plan found to restore');
      standardPlan = fallback;
    }

    await db
      .update(platformOrganizationSubscriptions)
      .set({ planId: standardPlan.id, updatedAt: new Date() })
      .where(eq(platformOrganizationSubscriptions.id, subscription.id));

    await logSubscriptionEvent({
      organizationId: input.organizationId,
      subscriptionId: subscription.id,
      actorUserId: input.actorUserId,
      eventType: 'custom_annual_price_cleared',
      detail: `Restored to standard plan ${standardPlan.slug} (₹${(STANDARD_SALON_PRICE_PAISE / 100).toLocaleString('en-IN')}/year)`,
    });
  } finally {
    await close();
  }
}

export async function getInvitationByToken(token: string) {
  if (!hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [invite] = await db
      .select({
        id: platformInvitations.id,
        email: platformInvitations.email,
        organizationId: platformInvitations.organizationId,
        accessRole: platformInvitations.accessRole,
        status: platformInvitations.status,
        expiresAt: platformInvitations.expiresAt,
        locationIds: platformInvitations.locationIds,
        organizationName: platformOrganizations.name,
      })
      .from(platformInvitations)
      .leftJoin(platformOrganizations, eq(platformInvitations.organizationId, platformOrganizations.id))
      .where(eq(platformInvitations.token, token.trim()))
      .limit(1);
    return invite ?? null;
  } finally {
    await close();
  }
}

export async function listOrganizationsForPlatformAdminFiltered(filters?: {
  q?: string;
  status?: string;
  planId?: string;
  sort?: 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc';
}): Promise<PlatformOrganizationListItem[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    let orgs = await db.select().from(platformOrganizations);
    const q = filters?.q?.trim().toLowerCase();
    if (q) {
      orgs = orgs.filter(
        (org) =>
          org.name.toLowerCase().includes(q) ||
          org.slug.toLowerCase().includes(q),
      );
    }
    if (filters?.status) {
      orgs = orgs.filter((org) => org.status === filters.status);
    }
    const sort = filters?.sort ?? 'created_desc';
    orgs.sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      if (sort === 'name_desc') return b.name.localeCompare(a.name);
      if (sort === 'created_asc') return a.createdAt.getTime() - b.createdAt.getTime();
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const enriched = await enrichOrganizationSummaries(db, orgs);
    if (filters?.planId) {
      return enriched.filter((row) => row.planId === filters.planId);
    }
    return enriched;
  } finally {
    await close();
  }
}

export async function getOrganizationsNeedingAttention(): Promise<OrganizationAttentionItem[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const items: OrganizationAttentionItem[] = [];
    const trialWindow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const subs = await db
      .select({
        organizationId: platformOrganizationSubscriptions.organizationId,
        status: platformOrganizationSubscriptions.status,
        currentPeriodEnd: platformOrganizationSubscriptions.currentPeriodEnd,
        orgName: platformOrganizations.name,
        orgSlug: platformOrganizations.slug,
        orgStatus: platformOrganizations.status,
      })
      .from(platformOrganizationSubscriptions)
      .innerJoin(
        platformOrganizations,
        eq(platformOrganizationSubscriptions.organizationId, platformOrganizations.id),
      );

    for (const sub of subs) {
      if (sub.status === 'past_due') {
        items.push({
          organizationId: sub.organizationId,
          organizationName: sub.orgName,
          slug: sub.orgSlug,
          reason: 'Subscription past due',
          severity: 'critical',
        });
      }
      if (sub.status === 'suspended') {
        items.push({
          organizationId: sub.organizationId,
          organizationName: sub.orgName,
          slug: sub.orgSlug,
          reason: 'Subscription suspended',
          severity: 'critical',
        });
      }
      if (
        sub.status === 'trial' &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd <= trialWindow
      ) {
        items.push({
          organizationId: sub.organizationId,
          organizationName: sub.orgName,
          slug: sub.orgSlug,
          reason:
            sub.currentPeriodEnd <= new Date()
              ? 'Trial expired - awaiting payment'
              : 'Trial expiring soon',
          severity: sub.currentPeriodEnd <= new Date() ? 'critical' : 'warning',
        });
      }
      if (sub.orgStatus === 'suspended') {
        items.push({
          organizationId: sub.organizationId,
          organizationName: sub.orgName,
          slug: sub.orgSlug,
          reason: 'Organization suspended',
          severity: 'critical',
        });
      }
    }

    const pendingOwnerInvites = await db
      .select({
        organizationId: platformInvitations.organizationId,
        orgName: platformOrganizations.name,
        orgSlug: platformOrganizations.slug,
      })
      .from(platformInvitations)
      .innerJoin(platformOrganizations, eq(platformInvitations.organizationId, platformOrganizations.id))
      .where(
        and(
          eq(platformInvitations.accessRole, 'owner'),
          eq(platformInvitations.status, 'pending'),
        ),
      );

    for (const invite of pendingOwnerInvites) {
      if (!invite.organizationId) continue;
      const [acceptedOwner] = await db
        .select({ id: platformMemberships.id })
        .from(platformMemberships)
        .innerJoin(platformUsers, eq(platformMemberships.userId, platformUsers.id))
        .where(
          and(
            eq(platformMemberships.organizationId, invite.organizationId),
            eq(platformMemberships.accessRole, 'owner'),
            eq(platformUsers.status, 'active'),
          ),
        )
        .limit(1);
      if (!acceptedOwner) {
        items.push({
          organizationId: invite.organizationId,
          organizationName: invite.orgName,
          slug: invite.orgSlug,
          reason: 'Owner invitation pending',
          severity: 'warning',
        });
      }
    }

    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.organizationId}:${item.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } finally {
    await close();
  }
}

export async function listAllPlatformLocations(): Promise<PlatformLocationListItem[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    return await db
      .select({
        id: platformLocations.id,
        name: platformLocations.name,
        organizationId: platformLocations.organizationId,
        organizationName: platformOrganizations.name,
        status: platformLocations.status,
        isPrimary: platformLocations.isPrimary,
        address: platformLocations.address,
        createdAt: platformLocations.createdAt,
      })
      .from(platformLocations)
      .innerJoin(platformOrganizations, eq(platformLocations.organizationId, platformOrganizations.id))
      .orderBy(desc(platformLocations.createdAt));
  } finally {
    await close();
  }
}

export async function listPlatformSubscriptionEvents(options?: {
  limit?: number;
  organizationId?: string;
}) {
  if (!hasPlatformDatabaseUrl()) return [];
  const limit = options?.limit ?? 50;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const conditions = options?.organizationId
      ? eq(platformSubscriptionEvents.organizationId, options.organizationId)
      : undefined;
    const base = db
      .select({
        id: platformSubscriptionEvents.id,
        organizationId: platformSubscriptionEvents.organizationId,
        organizationName: platformOrganizations.name,
        eventType: platformSubscriptionEvents.eventType,
        detail: platformSubscriptionEvents.detail,
        actorUserId: platformSubscriptionEvents.actorUserId,
        actorEmail: platformUsers.email,
        createdAt: platformSubscriptionEvents.createdAt,
      })
      .from(platformSubscriptionEvents)
      .innerJoin(
        platformOrganizations,
        eq(platformSubscriptionEvents.organizationId, platformOrganizations.id),
      )
      .leftJoin(platformUsers, eq(platformSubscriptionEvents.actorUserId, platformUsers.id))
      .orderBy(desc(platformSubscriptionEvents.createdAt))
      .limit(limit);
    if (conditions) {
      return await base.where(conditions);
    }
    return await base;
  } finally {
    await close();
  }
}

export async function searchPlatformAdmin(query: string): Promise<PlatformSearchResult[]> {
  const q = query.trim();
  if (!q || !hasPlatformDatabaseUrl()) return [];
  const pattern = `%${q}%`;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const orgs = await db
      .select({
        id: platformOrganizations.id,
        name: platformOrganizations.name,
        slug: platformOrganizations.slug,
      })
      .from(platformOrganizations)
      .where(or(ilike(platformOrganizations.name, pattern), ilike(platformOrganizations.slug, pattern)))
      .limit(10);
    const users = await db
      .select({ id: platformUsers.id, email: platformUsers.email })
      .from(platformUsers)
      .where(ilike(platformUsers.email, pattern))
      .limit(10);
    const results: PlatformSearchResult[] = orgs.map((org) => ({
      type: 'organization',
      id: org.id,
      label: org.name,
      sublabel: org.slug,
      href: `/platform/admin/organizations/${org.id}`,
    }));
    for (const user of users) {
      results.push({
        type: 'user',
        id: user.id,
        label: user.email,
        sublabel: 'Platform user',
        href: `/platform/admin/users`,
      });
    }
    return results.slice(0, 20);
  } finally {
    await close();
  }
}

export async function listUserOrganizationMemberships(
  userIds: string[],
): Promise<Record<string, Array<{ organizationName: string; role: string }>>> {
  if (!hasPlatformDatabaseUrl() || userIds.length === 0) return {};
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const rows = await db
      .select({
        userId: platformMemberships.userId,
        organizationName: platformOrganizations.name,
        accessRole: platformMemberships.accessRole,
      })
      .from(platformMemberships)
      .innerJoin(platformOrganizations, eq(platformMemberships.organizationId, platformOrganizations.id))
      .where(inArray(platformMemberships.userId, userIds));
    const map: Record<string, Array<{ organizationName: string; role: string }>> = {};
    for (const row of rows) {
      if (!map[row.userId]) map[row.userId] = [];
      map[row.userId].push({ organizationName: row.organizationName, role: row.accessRole });
    }
    return map;
  } finally {
    await close();
  }
}

export async function revokeInvitation(invitationId: string, actorUserId: string): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [invite] = await db
      .select()
      .from(platformInvitations)
      .where(eq(platformInvitations.id, invitationId))
      .limit(1);
    if (!invite) throw new Error('Invitation not found');
    if (invite.status !== 'pending') throw new Error('Only pending invitations can be revoked');
    await db
      .update(platformInvitations)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(platformInvitations.id, invitationId));
    if (invite.organizationId) {
      await logSubscriptionEvent({
        organizationId: invite.organizationId,
        actorUserId,
        eventType: 'invitation_revoked',
        detail: `Revoked ${invite.accessRole} invitation for ${invite.email}`,
      });
    }
  } finally {
    await close();
  }
}

export async function resendInvitation(invitationId: string, actorUserId: string): Promise<void> {
  const token = randomToken(24);
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [invite] = await db
      .select()
      .from(platformInvitations)
      .where(eq(platformInvitations.id, invitationId))
      .limit(1);
    if (!invite) throw new Error('Invitation not found');
    if (invite.status !== 'pending') throw new Error('Only pending invitations can be resent');
    await db
      .update(platformInvitations)
      .set({
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(platformInvitations.id, invitationId));
    if (invite.organizationId) {
      await logSubscriptionEvent({
        organizationId: invite.organizationId,
        actorUserId,
        eventType: 'invitation_resent',
        detail: `Resent ${invite.accessRole} invitation to ${invite.email}`,
      });
    }
  } finally {
    await close();
  }
}
