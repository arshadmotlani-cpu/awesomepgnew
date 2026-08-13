import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { unresolvedActions } from '@/src/db/schema';
import type { UnresolvedActionType } from '@/src/db/schema/enums';
import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';
import {
  operationsFilterCount,
  operationsTotalPendingCount,
} from '@/src/lib/operations/operationsQueueCounts';
import { countVacatingOperationsQueueItems } from '@/src/lib/operations/operationsQueueVacating';
import { getUnifiedOperationsQueueForBadges } from '@/src/services/unifiedOperationsQueue';
import { countUnreadForAdmin } from '@/src/services/notificationEngine';
import {
  loadMoveOutPipelineBundle,
} from '@/src/services/moveOutPipelineService';
import { loadOperationsQueueDismissalIndex } from '@/src/services/operationsQueueDismissals';
import {
  UNRESOLVED_ACTION_BADGE_BUCKET,
  type UnresolvedBadgeBucket,
} from '@/src/services/unresolvedActions';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';
import { adminCanAccessPg } from '@/src/lib/auth/roles';

/** Sidebar badge keys — all Operations tab counts from unified queue SSOT. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications' | 'moveOut', number>
>;

function badgeFromFilterCount(
  queue: Awaited<ReturnType<typeof getUnifiedOperationsQueueForBadges>>,
  filter: OpsQueueFilter,
): number | undefined {
  const count = operationsFilterCount(queue, filter);
  return count > 0 ? count : undefined;
}

async function loadMoveOutBadgeCount(session: AdminSession): Promise<number> {
  const [bundle, dismissalIndex] = await Promise.all([
    loadMoveOutPipelineBundle(session, { syncSettlements: false }),
    loadOperationsQueueDismissalIndex(),
  ]);
  const vacatingPgByRequestId = new Map(
    bundle.vacatingRows.map((row) => [row.id, row.pgId]),
  );
  return countVacatingOperationsQueueItems(
    bundle.activeItems,
    session,
    dismissalIndex,
    vacatingPgByRequestId,
  );
}

const BADGE_CACHE_TTL_MS = 45_000;
let badgeCache: { scopeKey: string; at: number; badges: AdminNavBadges } | null = null;

function sessionPgFilter(session: AdminSession) {
  if (session.role === 'super_admin' || session.pgScope.length === 0) {
    return undefined;
  }
  return session.pgScope;
}

function readCachedBadges(scopeKey: string): AdminNavBadges | null {
  if (!badgeCache || badgeCache.scopeKey !== scopeKey) return null;
  if (Date.now() - badgeCache.at >= BADGE_CACHE_TTL_MS) return null;
  return badgeCache.badges;
}

function writeCachedBadges(scopeKey: string, badges: AdminNavBadges): void {
  badgeCache = { scopeKey, at: Date.now(), badges };
}

/**
 * Fast badge path — counts OPEN unresolved_actions rows (SSOT for admin badges).
 * Does not build the unified Operations queue.
 */
async function loadAdminNavBadgesLight(session: AdminSession): Promise<AdminNavBadges> {
  const rows = await db
    .select({ actionType: unresolvedActions.actionType, pgId: unresolvedActions.pgId })
    .from(unresolvedActions)
    .where(
      and(eq(unresolvedActions.status, 'OPEN'), ne(unresolvedActions.actionType, 'invoice_review')),
    );

  const pgFilter = sessionPgFilter(session);
  const scoped = pgFilter
    ? rows.filter(
        (row) => row.pgId != null && adminCanAccessPg({ role: session.role, pgScope: pgFilter }, row.pgId),
      )
    : rows;

  const bucketCounts: Record<UnresolvedBadgeBucket, number> = {
    operations: 0,
    payments: 0,
    kyc: 0,
    checkout: 0,
  };

  for (const row of scoped) {
    const type = row.actionType as Exclude<UnresolvedActionType, 'invoice_review'>;
    const bucket = UNRESOLVED_ACTION_BADGE_BUCKET[type];
    if (bucket) bucketCounts[bucket] += 1;
  }

  const badges: AdminNavBadges = {};
  const totalOpen = scoped.length;
  if (totalOpen > 0) badges.operations = totalOpen;
  if (bucketCounts.payments > 0) badges.payments = bucketCounts.payments;
  if (bucketCounts.kyc > 0) badges.kyc = bucketCounts.kyc;
  if (bucketCounts.checkout > 0) badges.checkoutSettlements = bucketCounts.checkout;

  const unreadNotifications = await countUnreadForAdmin(session);
  if (unreadNotifications > 0) badges.notifications = unreadNotifications;

  const moveOutCount = await loadMoveOutBadgeCount(session);
  if (moveOutCount > 0) badges.moveOut = moveOutCount;

  return badges;
}

/** Full queue build — parity audits / explicit opt-in only. */
async function loadAdminNavBadgesFromQueue(session: AdminSession): Promise<AdminNavBadges> {
  const operationsQueue = await getUnifiedOperationsQueueForBadges(session);
  const badges: AdminNavBadges = {};

  const pendingTotal = operationsTotalPendingCount(operationsQueue);
  if (pendingTotal > 0) badges.operations = pendingTotal;

  const waitingForApproval = badgeFromFilterCount(operationsQueue, 'waiting_for_approval');
  if (waitingForApproval) badges.payments = waitingForApproval;

  const kyc = badgeFromFilterCount(operationsQueue, 'kyc_review');
  if (kyc) badges.kyc = kyc;

  const checkoutSettlements = badgeFromFilterCount(operationsQueue, 'refund_due');
  if (checkoutSettlements) badges.checkoutSettlements = checkoutSettlements;

  const moveOut = badgeFromFilterCount(operationsQueue, 'vacating_requests');
  if (moveOut) badges.moveOut = moveOut;

  const unreadNotifications = await countUnreadForAdmin(session);
  if (unreadNotifications > 0) badges.notifications = unreadNotifications;

  return badges;
}

export type LoadAdminNavBadgesOptions = {
  /** Use in-memory TTL cache (layout SSR + live poll). */
  pollCache?: boolean;
  /** Build full unified Operations queue — slow; audits only. */
  fullQueue?: boolean;
};

/**
 * Sidebar badges — OPEN unresolved_actions counts (fast path).
 * Full Operations queue is opt-in via fullQueue for parity scripts only.
 */
export async function loadAdminNavBadges(
  session: AdminSession,
  opts?: LoadAdminNavBadgesOptions,
): Promise<AdminNavBadges> {
  const scopeKey = adminRequestScopeKey(session);
  const cached = opts?.pollCache !== false ? readCachedBadges(scopeKey) : null;
  if (cached) return cached;

  try {
    const badges = await profileAdminStep('loadAdminNavBadges', async () =>
      opts?.fullQueue ? loadAdminNavBadgesFromQueue(session) : loadAdminNavBadgesLight(session),
    );

    writeCachedBadges(scopeKey, badges);
    return badges;
  } catch {
    return readCachedBadges(scopeKey) ?? {};
  }
}

/** Test/profiling — reset in-process badge cache. */
export function resetAdminNavBadgeCache(): void {
  badgeCache = null;
}
