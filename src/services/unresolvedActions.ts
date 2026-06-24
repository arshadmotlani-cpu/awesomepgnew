/**
 * SSOT — admin-required steps. OPEN actions appear everywhere; CLOSED appear nowhere.
 * Notifications are not SSOT — badges and queues read from this table only.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { unresolvedActions } from '@/src/db/schema';
import type {
  UnresolvedActionPriority,
  UnresolvedActionType,
} from '@/src/db/schema/enums';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';

export type UnresolvedActionRow = {
  id: string;
  actionType: UnresolvedActionType;
  entityType: string;
  entityId: string;
  residentId: string | null;
  pgId: string | null;
  status: 'OPEN' | 'CLOSED';
  priority: UnresolvedActionPriority;
  sourceKey: string;
  href: string | null;
  label: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type UnresolvedBadgeBucket = 'operations' | 'payments' | 'kyc' | 'checkout';

export const UNRESOLVED_ACTION_BADGE_BUCKET: Record<
  UnresolvedActionType,
  UnresolvedBadgeBucket
> = {
  kyc_review: 'kyc',
  payment_proof_review: 'payments',
  bed_assignment: 'operations',
  move_out_approval: 'operations',
  checkout_settlement: 'checkout',
  deposit_refund_approval: 'operations',
  invoice_review: 'operations',
  room_transfer_approval: 'operations',
  maintenance_approval: 'operations',
};

function sessionPgFilter(session: AdminSession) {
  if (session.role === 'super_admin' || session.pgScope.length === 0) {
    return sql`true`;
  }
  return sql`${unresolvedActions.pgId} IN (${sql.join(
    session.pgScope.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}

export async function upsertOpenAction(input: {
  actionType: UnresolvedActionType;
  entityType: string;
  entityId: string;
  residentId?: string | null;
  pgId?: string | null;
  priority?: UnresolvedActionPriority;
  sourceKey: string;
  href?: string | null;
  label?: string | null;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(unresolvedActions)
    .values({
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      residentId: input.residentId ?? null,
      pgId: input.pgId ?? null,
      priority: input.priority ?? 'medium',
      sourceKey: input.sourceKey,
      href: input.href ?? null,
      label: input.label ?? null,
      status: 'OPEN',
      resolvedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: unresolvedActions.sourceKey,
      set: {
        actionType: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId,
        residentId: input.residentId ?? null,
        pgId: input.pgId ?? null,
        priority: input.priority ?? 'medium',
        href: input.href ?? null,
        label: input.label ?? null,
        status: 'OPEN',
        resolvedAt: null,
        updatedAt: now,
      },
      where: sql`${unresolvedActions.status} = 'CLOSED' OR ${unresolvedActions.status} = 'OPEN'`,
    });
}

export async function resolveAction(input: {
  sourceKey?: string;
  actionType?: UnresolvedActionType;
  entityType?: string;
  entityId?: string;
}): Promise<number> {
  const now = new Date();
  let whereClause;

  if (input.sourceKey) {
    whereClause = eq(unresolvedActions.sourceKey, input.sourceKey);
  } else if (input.actionType && input.entityType && input.entityId) {
    whereClause = and(
      eq(unresolvedActions.actionType, input.actionType),
      eq(unresolvedActions.entityType, input.entityType),
      eq(unresolvedActions.entityId, input.entityId),
    );
  } else {
    return 0;
  }

  const rows = await db
    .update(unresolvedActions)
    .set({ status: 'CLOSED', resolvedAt: now, updatedAt: now })
    .where(and(eq(unresolvedActions.status, 'OPEN'), whereClause))
    .returning({ id: unresolvedActions.id });

  return rows.length;
}

export async function getOpenActionsByType(
  session: AdminSession,
  actionType: UnresolvedActionType,
): Promise<UnresolvedActionRow[]> {
  const rows = await db
    .select()
    .from(unresolvedActions)
    .where(
      and(
        eq(unresolvedActions.status, 'OPEN'),
        eq(unresolvedActions.actionType, actionType),
        sessionPgFilter(session),
      ),
    )
    .orderBy(sql`${unresolvedActions.priority} DESC`, unresolvedActions.createdAt);

  return rows.map(mapRow);
}

export async function getOpenActionsForResident(
  residentId: string,
): Promise<UnresolvedActionRow[]> {
  const rows = await db
    .select()
    .from(unresolvedActions)
    .where(
      and(eq(unresolvedActions.residentId, residentId), eq(unresolvedActions.status, 'OPEN')),
    )
    .orderBy(sql`${unresolvedActions.priority} DESC`, unresolvedActions.createdAt);

  return rows.map(mapRow);
}

export async function getOpenActionsCount(
  session: AdminSession,
  bucket?: UnresolvedBadgeBucket,
): Promise<number> {
  const types = bucket
    ? (Object.entries(UNRESOLVED_ACTION_BADGE_BUCKET) as [UnresolvedActionType, UnresolvedBadgeBucket][])
        .filter(([, b]) => b === bucket)
        .map(([t]) => t)
    : null;

  const rows = await db
    .select({ id: unresolvedActions.id })
    .from(unresolvedActions)
    .where(
      and(
        eq(unresolvedActions.status, 'OPEN'),
        sessionPgFilter(session),
        types ? inArray(unresolvedActions.actionType, types) : sql`true`,
      ),
    );

  return rows.length;
}

function mapRow(row: typeof unresolvedActions.$inferSelect): UnresolvedActionRow {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    residentId: row.residentId,
    pgId: row.pgId,
    status: row.status,
    priority: row.priority,
    sourceKey: row.sourceKey,
    href: row.href,
    label: row.label,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

export async function closeUnresolvedActionsNotInSourceKeys(
  activeSourceKeys: Set<string>,
  session: AdminSession,
): Promise<number> {
  if (activeSourceKeys.size === 0) {
    const rows = await db
      .update(unresolvedActions)
      .set({ status: 'CLOSED', resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(unresolvedActions.status, 'OPEN'), sessionPgFilter(session)))
      .returning({ id: unresolvedActions.id });
    return rows.length;
  }

  const keys = [...activeSourceKeys];
  const rows = await db
    .update(unresolvedActions)
    .set({ status: 'CLOSED', resolvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(unresolvedActions.status, 'OPEN'),
        sessionPgFilter(session),
        sql`${unresolvedActions.sourceKey} NOT IN (${sql.join(
          keys.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .returning({ id: unresolvedActions.id });

  return rows.length;
}

export function canSessionAccessUnresolvedAction(
  session: AdminSession,
  pgId: string | null,
): boolean {
  if (!pgId) return session.role === 'super_admin';
  return adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId);
}
