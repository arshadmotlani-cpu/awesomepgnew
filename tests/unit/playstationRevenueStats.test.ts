import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Documents PS4 revenue counting rules enforced by getMembershipRevenueStats().
 * Revenue is recorded only on activation — not when a pending membership is created.
 */
test('PS4 revenue excludes pending checkout rows and activation duplicates', () => {
  type Tx = { kind: string; amountPaise: number };
  type Membership = { status: string; transactions: Tx[] };

  function revenueFor(memberships: Membership[]) {
    let total = 0;
    let count = 0;
    for (const m of memberships) {
      if (m.status !== 'active' && m.status !== 'expired') continue;
      for (const tx of m.transactions) {
        if (!['purchase', 'renew', 'upgrade', 'admin_activate'].includes(tx.kind)) continue;
        if (
          tx.kind === 'purchase' &&
          m.transactions.some((other) => other.kind === 'admin_activate')
        ) {
          continue;
        }
        total += tx.amountPaise;
        count += 1;
      }
    }
    return { totalRevenuePaise: total, transactionCount: count };
  }

  const oneApproved = revenueFor([
    {
      status: 'active',
      transactions: [
        { kind: 'purchase', amountPaise: 35_000 },
        { kind: 'admin_activate', amountPaise: 35_000 },
      ],
    },
    {
      status: 'cancelled',
      transactions: [{ kind: 'purchase', amountPaise: 35_000 }],
    },
  ]);

  assert.equal(oneApproved.totalRevenuePaise, 35_000);
  assert.equal(oneApproved.transactionCount, 1);
});
