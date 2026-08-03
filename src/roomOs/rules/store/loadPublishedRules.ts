/**
 * Load active published rules from DB — Wave 5 rule store.
 */

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsPublishedRules } from '@/src/db/schema/roomOsPublishedRules';
import type { RuleDefinition } from '@/src/roomOs/rules/catalog/v1';
import {
  mapPublishedRuleRow,
  toRuleDefinition,
  type LoadPublishedRulesInput,
  type PublishedRuleRecord,
} from '@/src/roomOs/rules/store/types';

function asOfDate(asOf: string): Date {
  return new Date(asOf);
}

function rowAppliesToContext(
  row: PublishedRuleRecord,
  input: LoadPublishedRulesInput,
): boolean {
  switch (row.scope) {
    case 'global':
      return row.scopeRef == null;
    case 'property':
      return row.scopeRef == null || row.scopeRef === input.pgId;
    case 'floor':
      return row.scopeRef == null || (input.floorId != null && row.scopeRef === input.floorId);
    case 'room':
      return row.scopeRef == null || (input.roomId != null && row.scopeRef === input.roomId);
    case 'bed':
      return row.scopeRef == null || (input.bedId != null && row.scopeRef === input.bedId);
    case 'booking':
      return row.scopeRef == null || (input.bookingId != null && row.scopeRef === input.bookingId);
    default:
      return false;
  }
}

function isEffectiveAt(record: PublishedRuleRecord, asOf: string): boolean {
  if (record.status !== 'active') return false;
  const at = asOfDate(asOf).getTime();
  const from = asOfDate(record.effectiveFrom).getTime();
  if (at < from) return false;
  if (record.effectiveTo) {
    return at <= asOfDate(record.effectiveTo).getTime();
  }
  return true;
}

/** Latest active version per rule_id that is effective at asOf. */
function pickLatestApplicableVersions(
  rows: PublishedRuleRecord[],
  input: LoadPublishedRulesInput,
): PublishedRuleRecord[] {
  const applicable = rows.filter(
    (row) => isEffectiveAt(row, input.asOf) && rowAppliesToContext(row, input),
  );
  const byRuleId = new Map<string, PublishedRuleRecord>();
  for (const row of applicable) {
    const existing = byRuleId.get(row.id);
    if (!existing || row.version > existing.version) {
      byRuleId.set(row.id, row);
    }
  }
  return [...byRuleId.values()];
}

export async function loadPublishedRuleRecords(
  input: LoadPublishedRulesInput,
): Promise<PublishedRuleRecord[]> {
  const at = asOfDate(input.asOf);
  const rows = await db
    .select()
    .from(roomOsPublishedRules)
    .where(
      and(
        eq(roomOsPublishedRules.status, 'active'),
        lte(roomOsPublishedRules.effectiveFrom, at),
        or(
          isNull(roomOsPublishedRules.effectiveTo),
          sql`${roomOsPublishedRules.effectiveTo} >= ${at}`,
        ),
      ),
    );

  const mapped = rows.map(mapPublishedRuleRow);
  return pickLatestApplicableVersions(mapped, input);
}

export async function loadActivePublishedRules(
  input: LoadPublishedRulesInput,
): Promise<RuleDefinition[]> {
  const records = await loadPublishedRuleRecords(input);
  return records.map(toRuleDefinition);
}

export async function listPublishedRulesForPg(
  pgId: string,
): Promise<PublishedRuleRecord[]> {
  const rows = await db
    .select()
    .from(roomOsPublishedRules)
    .where(
      or(
        eq(roomOsPublishedRules.scope, 'global'),
        and(
          eq(roomOsPublishedRules.scope, 'property'),
          or(isNull(roomOsPublishedRules.scopeRef), eq(roomOsPublishedRules.scopeRef, pgId)),
        ),
      ),
    )
    .orderBy(roomOsPublishedRules.ruleId, roomOsPublishedRules.version);

  return rows.map(mapPublishedRuleRow);
}

export async function countPublishedRules(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomOsPublishedRules);
  return row?.count ?? 0;
}
