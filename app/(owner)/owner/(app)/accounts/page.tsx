import { AccountsUi } from '@/src/owner/components/wealth/AccountsUi';
import { getAccountsWithBalancesResolved } from '@/src/owner/services/financialAccounts';

export default async function OwnerAccountsPage() {
  const accounts = await getAccountsWithBalancesResolved().catch(() => []);

  return (
    <AccountsUi
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        accountType: a.accountType,
        balancePaise: a.balancePaise,
      }))}
    />
  );
}
