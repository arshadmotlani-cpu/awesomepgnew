import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  membershipTransactions,
  playstationMemberships,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { PlaystationMembership } from '@/src/db/schema/playstationMemberships';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  PS4_PLANS,
  type Ps4PlanId,
  isPs4PlanId,
  planRank,
} from '@/src/lib/playstation/plans';

export type { Ps4PlanId };

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function resolvePgIdForCustomer(customerId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(bookings.customerId, customerId),
        inArray(bookings.status, ['pending_payment', 'confirmed', 'completed']),
        inArray(bedReservations.status, ['hold', 'active']),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(1);
  return row?.pgId ?? null;
}

/** Active tenant = confirmed monthly/open-ended stay with an active primary reservation. */
export async function isActiveTenant(customerId: string): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(bedReservations, and(
      eq(bedReservations.bookingId, bookings.id),
      eq(bedReservations.kind, 'primary'),
    ))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, 'confirmed'),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        lte(sql`lower(${bedReservations.stayRange})`, sql`${now.toISOString()}::timestamptz`),
        gt(sql`upper(${bedReservations.stayRange})`, sql`${now.toISOString()}::timestamptz`),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Active tenant OR customer with a bed in the booking flow (hold / pending payment). */
export async function isEligibleForPs4Membership(customerId: string): Promise<boolean> {
  if (await isActiveTenant(customerId)) return true;

  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, 'pending_payment'),
        eq(bedReservations.status, 'hold'),
        eq(bedReservations.kind, 'primary'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function getActiveMembership(
  customerId: string,
): Promise<PlaystationMembership | null> {
  const now = new Date();
  const [row] = await db
    .select()
    .from(playstationMemberships)
    .where(
      and(
        eq(playstationMemberships.customerId, customerId),
        eq(playstationMemberships.status, 'active'),
        gt(playstationMemberships.expiresAt, now),
      ),
    )
    .orderBy(desc(playstationMemberships.expiresAt))
    .limit(1);
  return row ?? null;
}

/** Active, pending, or most recent membership for dashboard display. */
export async function getMembershipForDashboard(
  customerId: string,
): Promise<PlaystationMembership | null> {
  const active = await getActiveMembership(customerId);
  if (active) return active;

  const [pending] = await db
    .select()
    .from(playstationMemberships)
    .where(
      and(
        eq(playstationMemberships.customerId, customerId),
        eq(playstationMemberships.status, 'pending_payment'),
      ),
    )
    .orderBy(desc(playstationMemberships.createdAt))
    .limit(1);
  return pending ?? null;
}

export async function getPendingMembershipForBooking(bookingId: string) {
  const [row] = await db
    .select()
    .from(playstationMemberships)
    .where(
      and(
        eq(playstationMemberships.bookingId, bookingId),
        eq(playstationMemberships.status, 'pending_payment'),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function insertTransaction(
  membershipId: string,
  kind: typeof membershipTransactions.$inferInsert['kind'],
  input: {
    amountPaise?: number;
    fromPlan?: Ps4PlanId | null;
    toPlan?: Ps4PlanId | null;
    notes?: string;
    adminId?: string;
    paymentProofUrl?: string;
    transactionRef?: string;
  },
) {
  await db.insert(membershipTransactions).values({
    membershipId,
    kind,
    amountPaise: input.amountPaise ?? 0,
    fromPlan: input.fromPlan ?? null,
    toPlan: input.toPlan ?? null,
    notes: input.notes ?? null,
    adminId: input.adminId ?? null,
    paymentProofUrl: input.paymentProofUrl ?? null,
    transactionRef: input.transactionRef ?? null,
  });
}

/** Create a pending membership linked to a new booking checkout. */
export async function createPendingMembershipForBooking(input: {
  customerId: string;
  pgId: string;
  bookingId: string;
  plan: Ps4PlanId;
}) {
  const plan = PS4_PLANS[input.plan];
  const [row] = await db
    .insert(playstationMemberships)
    .values({
      customerId: input.customerId,
      pgId: input.pgId,
      bookingId: input.bookingId,
      plan: input.plan,
      status: 'pending_payment',
      amountPaise: plan.pricePaise,
    })
    .returning();
  await insertTransaction(row!.id, 'purchase', {
    amountPaise: plan.pricePaise,
    toPlan: input.plan,
    notes: 'Added during booking checkout',
  });
  return row!;
}

export async function purchaseMembership(input: {
  customerId: string;
  pgId: string;
  plan: Ps4PlanId;
  bookingId?: string;
}) {
  const eligible = await isEligibleForPs4Membership(input.customerId);
  if (!eligible) {
    throw new Error('PS4 membership is only available to active tenants or customers completing a bed booking.');
  }

  const active = await getActiveMembership(input.customerId);
  if (active) {
    throw new Error('You already have an active PS4 membership. Renew or upgrade instead.');
  }

  const plan = PS4_PLANS[input.plan];
  const [row] = await db
    .insert(playstationMemberships)
    .values({
      customerId: input.customerId,
      pgId: input.pgId,
      bookingId: input.bookingId ?? null,
      plan: input.plan,
      status: 'pending_payment',
      amountPaise: plan.pricePaise,
    })
    .returning();
  await insertTransaction(row!.id, 'purchase', {
    amountPaise: plan.pricePaise,
    toPlan: input.plan,
  });
  return row!;
}

export async function renewMembership(membershipId: string, customerId: string) {
  const [membership] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  if (!membership || membership.customerId !== customerId) {
    throw new Error('Membership not found.');
  }
  if (membership.status === 'cancelled') {
    throw new Error('This membership was cancelled.');
  }

  const plan = PS4_PLANS[membership.plan];
  await db
    .update(playstationMemberships)
    .set({
      status: 'pending_payment',
      amountPaise: plan.pricePaise,
      paymentProofUrl: null,
      transactionRef: null,
      updatedAt: new Date(),
    })
    .where(eq(playstationMemberships.id, membershipId));

  await insertTransaction(membershipId, 'renew', {
    amountPaise: plan.pricePaise,
    toPlan: membership.plan,
  });

  const [updated] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  return updated!;
}

export async function upgradeMembership(
  membershipId: string,
  customerId: string,
  newPlan: Ps4PlanId,
) {
  const [membership] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  if (!membership || membership.customerId !== customerId) {
    throw new Error('Membership not found.');
  }
  if (membership.status !== 'active' && membership.status !== 'pending_payment') {
    throw new Error('Only active or pending memberships can be upgraded.');
  }
  if (planRank(newPlan) <= planRank(membership.plan)) {
    throw new Error('Pick a higher plan to upgrade.');
  }

  const plan = PS4_PLANS[newPlan];
  await db
    .update(playstationMemberships)
    .set({
      plan: newPlan,
      status: 'pending_payment',
      amountPaise: plan.pricePaise,
      paymentProofUrl: null,
      transactionRef: null,
      updatedAt: new Date(),
    })
    .where(eq(playstationMemberships.id, membershipId));

  await insertTransaction(membershipId, 'upgrade', {
    amountPaise: plan.pricePaise,
    fromPlan: membership.plan,
    toPlan: newPlan,
  });

  const [updated] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  return updated!;
}

export async function submitMembershipPaymentProof(input: {
  membershipId: string;
  customerId: string;
  paymentProofUrl: string;
  transactionRef?: string;
}) {
  const [membership] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, input.membershipId))
    .limit(1);
  if (!membership || membership.customerId !== input.customerId) {
    throw new Error('Membership not found.');
  }
  if (membership.status !== 'pending_payment') {
    throw new Error('This membership is not awaiting payment.');
  }

  await db
    .update(playstationMemberships)
    .set({
      paymentProofUrl: input.paymentProofUrl.trim(),
      transactionRef: input.transactionRef?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(playstationMemberships.id, input.membershipId));

  await insertTransaction(input.membershipId, 'payment_proof', {
    amountPaise: membership.amountPaise,
    paymentProofUrl: input.paymentProofUrl,
    transactionRef: input.transactionRef,
  });
}

export async function activateMembership(membershipId: string, adminId?: string) {
  const [membership] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  if (!membership) throw new Error('Membership not found.');

  const plan = PS4_PLANS[membership.plan];
  const now = new Date();
  let startsAt = now;
  if (membership.status === 'active' && membership.expiresAt && membership.expiresAt > now) {
    startsAt = membership.expiresAt;
  }
  const expiresAt = addDays(startsAt, plan.durationDays);

  await db
    .update(playstationMemberships)
    .set({
      status: 'active',
      startsAt,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(playstationMemberships.id, membershipId));

  await insertTransaction(membershipId, adminId ? 'admin_activate' : 'purchase', {
    amountPaise: membership.amountPaise,
    toPlan: membership.plan,
    adminId,
    notes: adminId ? 'Activated by admin' : 'Payment confirmed',
  });
}

/** Called when booking payment succeeds — activates linked pending PS4 add-on. */
export async function activatePendingMembershipForBooking(bookingId: string) {
  const pending = await getPendingMembershipForBooking(bookingId);
  if (!pending || !pending.paymentProofUrl) return null;
  await activateMembership(pending.id);
  return pending.id;
}

export async function adminExtendMembership(
  session: AdminSession,
  membershipId: string,
  extraDays: number,
  notes?: string,
) {
  if (extraDays <= 0) throw new Error('Extension days must be positive.');
  const [membership] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  if (!membership) throw new Error('Membership not found.');

  const base = membership.expiresAt && membership.expiresAt > new Date()
    ? membership.expiresAt
    : new Date();
  const expiresAt = addDays(base, extraDays);

  await db
    .update(playstationMemberships)
    .set({
      status: 'active',
      startsAt: membership.startsAt ?? new Date(),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(playstationMemberships.id, membershipId));

  await insertTransaction(membershipId, 'admin_extend', {
    adminId: session.adminId,
    notes: notes ?? `Extended ${extraDays} day(s)`,
  });
}

export async function adminDeactivateMembership(session: AdminSession, membershipId: string) {
  await db
    .update(playstationMemberships)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(playstationMemberships.id, membershipId));
  await insertTransaction(membershipId, 'admin_deactivate', {
    adminId: session.adminId,
    notes: 'Deactivated by admin',
  });
}

export async function adminCancelMembership(session: AdminSession, membershipId: string) {
  await db
    .update(playstationMemberships)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(playstationMemberships.id, membershipId));
  await insertTransaction(membershipId, 'admin_cancel', {
    adminId: session.adminId,
    notes: 'Cancelled by admin',
  });
}

export async function adminManualActivate(
  session: AdminSession,
  input: { customerId: string; pgId: string; plan: Ps4PlanId; notes?: string },
) {
  if (!isPs4PlanId(input.plan)) throw new Error('Invalid plan.');
  const plan = PS4_PLANS[input.plan];
  const [row] = await db
    .insert(playstationMemberships)
    .values({
      customerId: input.customerId,
      pgId: input.pgId,
      plan: input.plan,
      status: 'active',
      startsAt: new Date(),
      expiresAt: addDays(new Date(), plan.durationDays),
      amountPaise: plan.pricePaise,
    })
    .returning();
  await insertTransaction(row!.id, 'admin_activate', {
    amountPaise: plan.pricePaise,
    toPlan: input.plan,
    adminId: session.adminId,
    notes: input.notes ?? 'Manual activation',
  });
  return row!;
}

export async function listAdminMemberships() {
  return db
    .select({
      id: playstationMemberships.id,
      customerId: playstationMemberships.customerId,
      customerName: customers.fullName,
      pgId: playstationMemberships.pgId,
      pgName: pgs.name,
      plan: playstationMemberships.plan,
      status: playstationMemberships.status,
      amountPaise: playstationMemberships.amountPaise,
      startsAt: playstationMemberships.startsAt,
      expiresAt: playstationMemberships.expiresAt,
      bookingId: playstationMemberships.bookingId,
      paymentProofUrl: playstationMemberships.paymentProofUrl,
      transactionRef: playstationMemberships.transactionRef,
      createdAt: playstationMemberships.createdAt,
    })
    .from(playstationMemberships)
    .innerJoin(customers, eq(customers.id, playstationMemberships.customerId))
    .innerJoin(pgs, eq(pgs.id, playstationMemberships.pgId))
    .orderBy(desc(playstationMemberships.createdAt));
}

export async function getMembershipRevenueStats() {
  const [row] = await db
    .select({
      totalPaise: sql<number>`coalesce(sum(${membershipTransactions.amountPaise}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(membershipTransactions)
    .where(
      inArray(membershipTransactions.kind, [
        'purchase',
        'renew',
        'upgrade',
        'admin_activate',
      ]),
    );
  return {
    totalRevenuePaise: row?.totalPaise ?? 0,
    transactionCount: row?.count ?? 0,
  };
}

export async function expireStaleMemberships() {
  const now = new Date();
  await db
    .update(playstationMemberships)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(playstationMemberships.status, 'active'),
        lte(playstationMemberships.expiresAt, now),
      ),
    );
}

export { resolvePgIdForCustomer };
