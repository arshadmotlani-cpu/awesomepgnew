import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const platformSchema = pgSchema('platform');

export const PLATFORM_USER_STATUSES = ['active', 'suspended', 'invited'] as const;
export type PlatformUserStatus = (typeof PLATFORM_USER_STATUSES)[number];

export const PLATFORM_ORG_STATUSES = ['active', 'suspended', 'trial'] as const;
export type PlatformOrgStatus = (typeof PLATFORM_ORG_STATUSES)[number];

export const PLATFORM_LOCATION_STATUSES = ['active', 'inactive'] as const;
export type PlatformLocationStatus = (typeof PLATFORM_LOCATION_STATUSES)[number];

export const PLATFORM_MEMBERSHIP_ROLES = [
  'owner',
  'co_owner',
  'manager',
  'biller',
  'staff',
] as const;
export type PlatformMembershipRole = (typeof PLATFORM_MEMBERSHIP_ROLES)[number];

export const PLATFORM_SUBSCRIPTION_STATUSES = [
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled',
] as const;
export type PlatformSubscriptionStatus = (typeof PLATFORM_SUBSCRIPTION_STATUSES)[number];

export const PLATFORM_INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type PlatformInvitationStatus = (typeof PLATFORM_INVITATION_STATUSES)[number];

export const platformUsers = platformSchema.table(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    status: text('status').$type<PlatformUserStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('platform_users_email_uidx').on(t.email)],
);

export const platformMembershipsSuper = platformSchema.table(
  'platform_memberships',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    role: text('role').notNull().default('admin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('platform_memberships_user_idx').on(t.userId),
    uniqueIndex('platform_memberships_user_role_uidx').on(t.userId, t.role),
  ],
);

export const platformPlans = platformSchema.table(
  'plans',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    limits: jsonb('limits').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('platform_plans_slug_uidx').on(t.slug)],
);

export const platformOrganizations = platformSchema.table(
  'organizations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: text('status').$type<PlatformOrgStatus>().notNull().default('active'),
    defaultTimezone: text('default_timezone').notNull().default('Asia/Kolkata'),
    gstin: text('gstin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('platform_organizations_slug_uidx').on(t.slug)],
);

export const platformLocations = platformSchema.table(
  'locations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => platformOrganizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    address: text('address'),
    status: text('status').$type<PlatformLocationStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('platform_locations_org_idx').on(t.organizationId),
    index('platform_locations_org_primary_idx').on(t.organizationId, t.isPrimary),
  ],
);

export const platformMemberships = platformSchema.table(
  'memberships',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => platformOrganizations.id, { onDelete: 'restrict' }),
    role: text('role').$type<PlatformMembershipRole>().notNull().default('staff'),
    accessRole: text('access_role').$type<PlatformMembershipRole>().notNull().default('staff'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('platform_memberships_user_idx').on(t.userId),
    index('platform_memberships_org_idx').on(t.organizationId),
    uniqueIndex('platform_memberships_user_org_uidx').on(t.userId, t.organizationId),
  ],
);

export const platformMembershipLocations = platformSchema.table(
  'membership_locations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => platformMemberships.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => platformLocations.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('platform_membership_locations_membership_idx').on(t.membershipId),
    index('platform_membership_locations_location_idx').on(t.locationId),
    uniqueIndex('platform_membership_locations_membership_location_uidx').on(
      t.membershipId,
      t.locationId,
    ),
  ],
);

export const platformOrganizationSubscriptions = platformSchema.table(
  'organization_subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => platformOrganizations.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => platformPlans.id, { onDelete: 'restrict' }),
    status: text('status').$type<PlatformSubscriptionStatus>().notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('platform_org_subscriptions_org_idx').on(t.organizationId)],
);

export const platformOrganizationEntitlements = platformSchema.table(
  'organization_entitlements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => platformOrganizations.id, { onDelete: 'restrict' }),
    featureKey: text('feature_key').notNull(),
    limit: integer('limit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('platform_org_entitlements_org_idx').on(t.organizationId),
    uniqueIndex('platform_org_entitlements_org_feature_uidx').on(t.organizationId, t.featureKey),
  ],
);

export const platformInvitations = platformSchema.table(
  'invitations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: text('email').notNull(),
    token: text('token').notNull(),
    organizationId: uuid('organization_id').references(() => platformOrganizations.id, {
      onDelete: 'cascade',
    }),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    accessRole: text('access_role').$type<PlatformMembershipRole>().notNull(),
    locationIds: jsonb('location_ids').$type<string[]>().notNull().default([]),
    status: text('status').$type<PlatformInvitationStatus>().notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('platform_invitations_token_uidx').on(t.token),
    index('platform_invitations_email_idx').on(t.email),
    index('platform_invitations_org_idx').on(t.organizationId),
  ],
);

export const platformSubscriptionEvents = platformSchema.table(
  'subscription_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => platformOrganizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => platformOrganizationSubscriptions.id, {
      onDelete: 'cascade',
    }),
    actorUserId: uuid('actor_user_id').references(() => platformUsers.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('platform_subscription_events_org_idx').on(t.organizationId, t.createdAt),
    index('platform_subscription_events_subscription_idx').on(t.subscriptionId, t.createdAt),
  ],
);
