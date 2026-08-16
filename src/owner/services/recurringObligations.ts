import { desc, eq } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooRecurringObligations } from '@/src/owner/db/schema';
import {
  paiseFromRupees,
  type ExpenseCategory,
} from '@/src/owner/lib/wealth/types';
import { writeAuditLog } from '@/src/owner/services/auditLog';

export async function listRecurringObligations(activeOnly = true) {
  const query = ownerDb
    .select()
    .from(ooRecurringObligations)
    .orderBy(desc(ooRecurringObligations.nextDueDate));
  if (activeOnly) {
    return query.where(eq(ooRecurringObligations.isActive, 1));
  }
  return query;
}

export async function createRecurringObligation(input: {
  name: string;
  amountRupees: number;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  category: ExpenseCategory;
  nextDueDate?: string | null;
  accountId?: string | null;
  assetId?: string | null;
  liabilityId?: string | null;
  businessId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const [row] = await ownerDb
    .insert(ooRecurringObligations)
    .values({
      name: input.name.trim(),
      amountPaise: paiseFromRupees(input.amountRupees),
      frequency: input.frequency,
      category: input.category,
      nextDueDate: input.nextDueDate ?? null,
      accountId: input.accountId ?? null,
      assetId: input.assetId ?? null,
      liabilityId: input.liabilityId ?? null,
      businessId: input.businessId ?? null,
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  await writeAuditLog({
    entityType: 'recurring_obligation',
    entityId: row.id,
    action: 'create',
    afterJson: row as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return row;
}

export async function getUpcomingRecurringObligations(limit = 10) {
  const today = new Date().toISOString().slice(0, 10);
  return ownerDb
    .select()
    .from(ooRecurringObligations)
    .where(eq(ooRecurringObligations.isActive, 1))
    .orderBy(ooRecurringObligations.nextDueDate)
    .limit(limit);
}
