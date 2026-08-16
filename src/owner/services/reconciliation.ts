import { and, eq, gte, lte } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import {
  ooIntegrationFacts,
  ooJournalEntries,
  ooJournalLineAllocations,
  ooJournalLines,
} from '@/src/owner/db/schema';

export async function sumLiabilityPrincipalPaid(opts?: {
  startDate?: string;
  endDate?: string;
}): Promise<number> {
  const conditions = [eq(ooJournalLines.eventType, 'LIABILITY_PAYMENT')];
  if (opts?.startDate) conditions.push(gte(ooJournalEntries.entryDate, opts.startDate));
  if (opts?.endDate) conditions.push(lte(ooJournalEntries.entryDate, opts.endDate));

  const rows = await ownerDb
    .select({
      principalPaise: ooJournalLineAllocations.principalPaise,
    })
    .from(ooJournalLineAllocations)
    .innerJoin(ooJournalLines, eq(ooJournalLineAllocations.journalLineId, ooJournalLines.id))
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(and(...conditions));

  return rows.reduce((sum, r) => sum + Number(r.principalPaise ?? 0), 0);
}

export async function reconcileIntegrationFacts(): Promise<{
  sources: Array<{ sourceSystem: string; factCount: number; lastSyncedAt: string | null }>;
}> {
  const facts = await ownerDb.select().from(ooIntegrationFacts);

  const bySource: Record<string, { count: number; lastSynced: Date | null }> = {};
  for (const fact of facts) {
    const key = fact.sourceSystem;
    if (!bySource[key]) bySource[key] = { count: 0, lastSynced: null };
    bySource[key].count += 1;
    if (!bySource[key].lastSynced || fact.syncedAt > bySource[key].lastSynced!) {
      bySource[key].lastSynced = fact.syncedAt;
    }
  }

  return {
    sources: Object.entries(bySource).map(([sourceSystem, data]) => ({
      sourceSystem,
      factCount: data.count,
      lastSyncedAt: data.lastSynced?.toISOString() ?? null,
    })),
  };
}
