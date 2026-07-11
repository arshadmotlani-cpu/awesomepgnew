import { and, eq, ne } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acLedgerEntries } from '@/src/capital/db/schema';
import type { ledgerDirectionEnum, ledgerEntryTypeEnum } from '@/src/capital/db/schema/enums';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';

type EntryType = (typeof ledgerEntryTypeEnum.enumValues)[number];
type Direction = (typeof ledgerDirectionEnum.enumValues)[number];

export type LedgerPostInput = {
  entryType: EntryType;
  direction: Direction;
  amountPaise: number;
  assetId?: string | null;
  sourceTable: string;
  sourceId: string;
  description: string;
  metadata?: Record<string, unknown>;
  reversalOfEntryId?: string | null;
};

export async function findLedgerEntryBySource(
  db: CapitalDbClient,
  sourceTable: string,
  sourceId: string,
  entryType?: EntryType,
) {
  const conditions = [
    eq(acLedgerEntries.sourceTable, sourceTable),
    eq(acLedgerEntries.sourceId, sourceId),
    ne(acLedgerEntries.entryType, 'reversal'),
  ];
  if (entryType) conditions.push(eq(acLedgerEntries.entryType, entryType));

  const [entry] = await db
    .select()
    .from(acLedgerEntries)
    .where(and(...conditions))
    .limit(1);
  return entry ?? null;
}

export async function postLedgerEntry(input: LedgerPostInput, db: CapitalDbClient = capitalDb) {
  const [entry] = await db
    .insert(acLedgerEntries)
    .values({
      entryType: input.entryType,
      direction: input.direction,
      amountPaise: input.amountPaise,
      assetId: input.assetId ?? null,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      description: input.description,
      metadata: input.metadata ?? {},
      reversalOfEntryId: input.reversalOfEntryId ?? null,
    })
    .returning();
  return entry;
}

export async function reverseLedgerEntry(
  originalEntryId: string,
  sourceTable: string,
  sourceId: string,
  description: string,
  db: CapitalDbClient = capitalDb,
) {
  const [orig] = await db
    .select()
    .from(acLedgerEntries)
    .where(eq(acLedgerEntries.id, originalEntryId))
    .limit(1);

  if (!orig) throw new Error('Ledger entry not found');

  const oppositeDirection: Direction = orig.direction === 'debit' ? 'credit' : 'debit';

  return postLedgerEntry(
    {
      entryType: 'reversal',
      direction: oppositeDirection,
      amountPaise: orig.amountPaise,
      assetId: orig.assetId,
      sourceTable,
      sourceId,
      description,
      reversalOfEntryId: originalEntryId,
    },
    db,
  );
}

export async function reverseAllSourceLedger(
  sourceTable: string,
  sourceId: string,
  description: string,
  db: CapitalDbClient = capitalDb,
) {
  const originals = await db
    .select()
    .from(acLedgerEntries)
    .where(
      and(
        eq(acLedgerEntries.sourceTable, sourceTable),
        eq(acLedgerEntries.sourceId, sourceId),
        ne(acLedgerEntries.entryType, 'reversal'),
      ),
    );

  if (originals.length === 0) {
    throw new Error(`Ledger entry not found for ${sourceTable}/${sourceId}`);
  }

  for (const orig of originals) {
    await reverseLedgerEntry(orig.id, sourceTable, sourceId, description, db);
  }
}

export async function reverseSourceLedger(
  sourceTable: string,
  sourceId: string,
  description: string,
  db: CapitalDbClient = capitalDb,
  entryType?: EntryType,
) {
  const original = await findLedgerEntryBySource(db, sourceTable, sourceId, entryType);
  if (!original) {
    await reverseAllSourceLedger(sourceTable, sourceId, description, db);
    return;
  }
  return reverseLedgerEntry(original.id, sourceTable, sourceId, description, db);
}
