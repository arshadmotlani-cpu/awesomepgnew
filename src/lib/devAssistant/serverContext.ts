import { execSync } from 'node:child_process';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import { appLogs } from '@/src/db/schema/appLogs';
import { getDeploymentsDashboardData } from '@/src/db/queries/deployments';
import type { DevAssistantDebugContext, DevAssistantEnrichedContext } from '@/src/lib/devAssistant/types';
import { loadCodebaseContext } from '@/src/lib/devAssistant/codebaseContext';

function safeGit(args: string): string | null {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

function gitSnapshot() {
  const branch = safeGit('rev-parse --abbrev-ref HEAD');
  const lastCommit = safeGit('log -1 --oneline');
  const status = safeGit('status --porcelain');
  const lines = status ? status.split('\n').filter(Boolean) : [];
  return {
    branch,
    lastCommit,
    pendingChanges: lines.length,
    dirty: lines.length > 0,
  };
}

async function loadRecentLogs(pathname: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({
        message: appLogs.message,
        route: appLogs.route,
        createdAt: appLogs.createdAt,
      })
      .from(appLogs)
      .where(
        and(
          eq(appLogs.level, 'error'),
          gte(appLogs.createdAt, since),
          pathname !== '/admin'
            ? sql`(${appLogs.route} = ${pathname} OR ${appLogs.route} IS NULL)`
            : sql`TRUE`,
        ),
      )
      .orderBy(desc(appLogs.createdAt))
      .limit(8);

    const [countRow] = await db
      .select({
        cnt: sql<number>`count(*)::int`,
      })
      .from(appLogs)
      .where(and(eq(appLogs.level, 'error'), gte(appLogs.createdAt, since)));

    return {
      recentErrors: rows.map((r) => ({
        message: r.message.slice(0, 500),
        route: r.route,
        at: r.createdAt.toISOString(),
      })),
      errorCountToday: countRow?.cnt ?? 0,
    };
  } catch {
    return { recentErrors: [], errorCountToday: 0 };
  }
}

async function loadEntityDatabaseContext(ctx: DevAssistantDebugContext): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  if (ctx.entity.bedId || ctx.entity.bedCode) {
    const bedId = ctx.entity.bedId;
    const bedCode = ctx.entity.bedCode;
    let bed: { id: string; bedCode: string; status: string; roomNumber: string } | undefined;
    if (bedId) {
      [bed] = await db
        .select({
          id: beds.id,
          bedCode: beds.bedCode,
          status: beds.status,
          roomNumber: rooms.roomNumber,
        })
        .from(beds)
        .innerJoin(rooms, eq(rooms.id, beds.roomId))
        .where(eq(beds.id, bedId))
        .limit(1);
    } else if (bedCode) {
      [bed] = await db
        .select({
          id: beds.id,
          bedCode: beds.bedCode,
          status: beds.status,
          roomNumber: rooms.roomNumber,
        })
        .from(beds)
        .innerJoin(rooms, eq(rooms.id, beds.roomId))
        .where(eq(beds.bedCode, bedCode))
        .limit(1);
    }

    if (bed) {
      out.bed = bed;
      const [active] = await db
        .select({
          bookingId: bedReservations.bookingId,
          bookingCode: bookings.bookingCode,
          customerName: customers.fullName,
          status: bedReservations.status,
        })
        .from(bedReservations)
        .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
        .innerJoin(customers, eq(customers.id, bookings.customerId))
        .where(
          and(
            eq(bedReservations.bedId, bed.id),
            eq(bedReservations.status, 'active'),
            sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
          ),
        )
        .limit(1);
      if (active) out.bedActiveReservation = active;
    }
  }

  if (ctx.entity.residentId) {
    const [customer] = await db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        phone: customers.phone,
        email: customers.email,
      })
      .from(customers)
      .where(eq(customers.id, ctx.entity.residentId))
      .limit(1);
    if (customer) out.resident = customer;
  }

  if (ctx.entity.bookingId) {
    const [booking] = await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        status: bookings.status,
        depositPaise: bookings.depositPaise,
        depositDuePaise: bookings.depositDuePaise,
      })
      .from(bookings)
      .where(eq(bookings.id, ctx.entity.bookingId))
      .limit(1);
    if (booking) out.booking = booking;
  }

  if (ctx.pathname.includes('/rent') || ctx.pageHints?.billingTab === 'rent') {
    const month = (ctx.filters.month ?? ctx.filters.billingMonth) as string | undefined;
    if (month) {
      const invoices = await db
        .select({
          invoiceNumber: rentInvoices.invoiceNumber,
          status: rentInvoices.status,
          rentPaise: rentInvoices.rentPaise,
        })
        .from(rentInvoices)
        .where(eq(rentInvoices.billingMonth, month))
        .limit(5);
      out.recentRentInvoicesSample = invoices;
    }
  }

  return out;
}

export async function enrichDevAssistantContext(
  ctx: DevAssistantDebugContext,
): Promise<DevAssistantEnrichedContext> {
  const [deploy, logs, codebase, database] = await Promise.all([
    getDeploymentsDashboardData().catch(() => null),
    loadRecentLogs(ctx.pathname),
    loadCodebaseContext(ctx.pathname),
    loadEntityDatabaseContext(ctx),
  ]);

  const git = gitSnapshot();

  return {
    ...ctx,
    deployment: {
      latestDeploymentId: deploy?.tracker.latestDeploymentId ?? null,
      lastStableDeploymentId: deploy?.tracker.lastStableDeploymentId ?? null,
      trackerStatus: deploy?.tracker.status ?? 'unknown',
      vercelLatestUrl: deploy?.vercelLatest?.url ?? null,
      vercelLatestState: deploy?.vercelLatest?.state ?? null,
      recentEvents: (deploy?.events ?? []).slice(0, 5).map((e) => ({
        status: e.status,
        deploymentId: e.deploymentId,
        at: e.createdAt,
      })),
    },
    git,
    logs,
    codebase,
    database,
  };
}

export function formatEnrichedContextForPrompt(ctx: DevAssistantEnrichedContext): string {
  const lines: string[] = [
    '=== ENRICHED DEV CONTEXT ===',
    `Page: ${ctx.pageName} (${ctx.pathname})`,
    `Admin: ${ctx.admin.fullName} (${ctx.admin.role})`,
  ];

  if (Object.keys(ctx.entity).length > 0) {
    lines.push(`Entity: ${JSON.stringify(ctx.entity)}`);
  }
  if (ctx.recentErrors.length > 0) {
    lines.push('\n--- Browser errors ---');
    for (const e of ctx.recentErrors.slice(-5)) {
      lines.push(`[${e.type}] ${e.message}`);
    }
  }
  if (ctx.sentry?.lastEventId) {
    lines.push(`\nSentry event: ${ctx.sentry.lastEventId}`);
  }
  lines.push(
    `\nGit: ${ctx.git.branch ?? '?'} @ ${ctx.git.lastCommit ?? '?'} (${ctx.git.pendingChanges} pending)`,
  );
  lines.push(
    `Deploy: ${ctx.deployment.trackerStatus} · latest ${ctx.deployment.latestDeploymentId ?? 'none'}`,
  );
  if (ctx.logs.recentErrors.length > 0) {
    lines.push('\n--- Server logs (24h) ---');
    for (const e of ctx.logs.recentErrors.slice(0, 5)) {
      lines.push(`${e.route ?? '?'}: ${e.message}`);
    }
  }
  if (Object.keys(ctx.database).length > 0) {
    lines.push(`\nDatabase context: ${JSON.stringify(ctx.database).slice(0, 2000)}`);
  }
  if (ctx.codebase.length > 0) {
    lines.push('\n--- Relevant code ---');
    for (const f of ctx.codebase) {
      lines.push(`\n## ${f.path} (${f.reason})\n${f.excerpt.slice(0, 800)}`);
    }
  }
  lines.push('=== END CONTEXT ===');
  return lines.join('\n');
}
