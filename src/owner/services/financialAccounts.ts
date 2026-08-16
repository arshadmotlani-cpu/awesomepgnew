import { desc, eq } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooFinancialAccounts } from '@/src/owner/db/schema';
import { createJournalEntry } from '@/src/owner/services/journal';
import { writeAuditLog } from '@/src/owner/services/auditLog';
import { getAccountBalancePaise } from '@/src/owner/services/journal';

export async function listFinancialAccounts(activeOnly = true) {
  const query = ownerDb.select().from(ooFinancialAccounts).orderBy(desc(ooFinancialAccounts.createdAt));
  if (activeOnly) {
    return query.where(eq(ooFinancialAccounts.isActive, 1));
  }
  return query;
}

export async function getFinancialAccount(id: string) {
  const [row] = await ownerDb
    .select()
    .from(ooFinancialAccounts)
    .where(eq(ooFinancialAccounts.id, id))
    .limit(1);
  return row ?? null;
}

export async function createFinancialAccount(input: {
  name: string;
  accountType?: string;
  notes?: string | null;
  openingBalancePaise?: number;
  openingDate?: string;
  createdBy?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error('Account name is required');

  const [account] = await ownerDb
    .insert(ooFinancialAccounts)
    .values({
      name,
      accountType: input.accountType ?? 'bank',
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  if (input.openingBalancePaise && input.openingBalancePaise > 0) {
    await createJournalEntry({
      entryDate: input.openingDate ?? new Date().toISOString().slice(0, 10),
      description: `Opening balance — ${name}`,
      eventType: 'OPENING_BALANCE',
      createdBy: input.createdBy,
      lines: [
        {
          amountPaise: input.openingBalancePaise,
          eventType: 'OPENING_BALANCE',
          accountId: account.id,
        },
      ],
    });
  }

  await writeAuditLog({
    entityType: 'financial_account',
    entityId: account.id,
    action: 'create',
    afterJson: account as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return account;
}

export async function listAccountsWithBalances() {
  const accounts = await listFinancialAccounts();
  return accounts.map(async (account) => ({
    ...account,
    balancePaise: await getAccountBalancePaise(account.id),
  }));
}

export async function getAccountsWithBalancesResolved() {
  const accounts = await listFinancialAccounts();
  const withBalances = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      balancePaise: await getAccountBalancePaise(account.id),
    })),
  );
  return withBalances;
}
