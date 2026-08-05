/**
 * Recent Owner OS inbox events — read-only.
 */
import { desc, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooEventInbox } from '@/src/owner/db/schema';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';

export type OwnerRecentEvent = {
  id: string;
  eventType: string;
  sourceEngine: string;
  createdAt: string;
  processed: boolean;
};

export type OwnerInboxStatus = {
  total: number;
  pending: number;
};

export async function loadRecentOwnerEvents(limit = 10): Promise<OwnerRecentEvent[]> {
  if (!hasOwnerDatabaseUrl()) return [];
  try {
    const rows = await ownerDb
      .select()
      .from(ooEventInbox)
      .orderBy(desc(ooEventInbox.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      sourceEngine: r.sourceEngine,
      createdAt: r.createdAt.toISOString(),
      processed: r.processedAt != null,
    }));
  } catch {
    return [];
  }
}

export async function loadOwnerInboxStatus(): Promise<OwnerInboxStatus | null> {
  if (!hasOwnerDatabaseUrl()) return null;
  try {
    const [row] = await ownerDb
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${ooEventInbox.processedAt} is null)::int`,
      })
      .from(ooEventInbox);
    return {
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
    };
  } catch {
    return null;
  }
}
