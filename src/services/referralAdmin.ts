/**
 * Referral program admin analytics.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type TopReferrerRow = {
  customerId: string;
  customerName: string;
  referralCode: string;
  totalEarningsPaise: number;
  successfulReferrals: number;
  pendingPaise: number;
  withdrawnPaise: number;
};

export type ReferralProgramSnapshot = {
  topReferrers: TopReferrerRow[];
  totalPendingWithdrawals: number;
  totalPaidWithdrawals: number;
  totalRejectedWithdrawals: number;
};

export async function getReferralProgramSnapshot(): Promise<ReferralProgramSnapshot> {
  const topReferrers = await db.execute<{
    customer_id: string;
    customer_name: string;
    total_earnings_paise: number;
    successful_referrals: number;
    pending_paise: number;
    withdrawn_paise: number;
  }>(sql`
    SELECT
      c.id::text AS customer_id,
      c.full_name AS customer_name,
      coalesce(sum(re.amount_paise), 0)::bigint AS total_earnings_paise,
      count(DISTINCT rr.id) FILTER (WHERE rr.status = 'applied')::int AS successful_referrals,
      coalesce(sum(re.amount_paise) FILTER (WHERE re.status = 'locked'), 0)::bigint AS pending_paise,
      coalesce(sum(re.amount_paise) FILTER (WHERE re.status = 'withdrawn'), 0)::bigint AS withdrawn_paise
    FROM customers c
    LEFT JOIN referral_earnings re ON re.referrer_customer_id = c.id
    LEFT JOIN referral_redemptions rr ON rr.referrer_customer_id = c.id
    GROUP BY c.id, c.full_name
    HAVING coalesce(sum(re.amount_paise), 0) > 0
    ORDER BY total_earnings_paise DESC
    LIMIT 10
  `);

  const withdrawalStats = await db.execute<{
    pending: number;
    paid: number;
    rejected: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE status IN ('pending', 'approved'))::int AS pending,
      count(*) FILTER (WHERE status = 'paid')::int AS paid,
      count(*) FILTER (WHERE status = 'rejected')::int AS rejected
    FROM referral_withdrawal_requests
  `);

  const stats = withdrawalStats[0];

  return {
    topReferrers: topReferrers.map((r) => ({
      customerId: r.customer_id,
      customerName: r.customer_name,
      referralCode: r.customer_id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      totalEarningsPaise: Number(r.total_earnings_paise),
      successfulReferrals: r.successful_referrals,
      pendingPaise: Number(r.pending_paise),
      withdrawnPaise: Number(r.withdrawn_paise),
    })),
    totalPendingWithdrawals: stats?.pending ?? 0,
    totalPaidWithdrawals: stats?.paid ?? 0,
    totalRejectedWithdrawals: stats?.rejected ?? 0,
  };
}

export async function getReferralStatsForResident(customerId: string) {
  const rows = await db.execute<{
    invited: number;
    earned: number;
    withdrawn: number;
    pending: number;
  }>(sql`
    SELECT
      count(DISTINCT rr.id)::int AS invited,
      coalesce(sum(re.amount_paise), 0)::bigint AS earned,
      coalesce(sum(re.amount_paise) FILTER (WHERE re.status = 'withdrawn'), 0)::bigint AS withdrawn,
      coalesce(sum(re.amount_paise) FILTER (WHERE re.status = 'locked'), 0)::bigint AS pending
    FROM referral_redemptions rr
    FULL OUTER JOIN referral_earnings re ON re.referrer_customer_id = ${customerId}::uuid
    WHERE rr.referrer_customer_id = ${customerId}::uuid OR re.referrer_customer_id = ${customerId}::uuid
  `);
  const row = rows[0];
  return {
    invited: row?.invited ?? 0,
    earnedPaise: Number(row?.earned ?? 0),
    withdrawnPaise: Number(row?.withdrawn ?? 0),
    pendingPaise: Number(row?.pending ?? 0),
  };
}
