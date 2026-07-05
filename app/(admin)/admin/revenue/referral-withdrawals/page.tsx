import { PageHeader } from '@/src/components/admin/PageHeader';
import { ReferralWithdrawalsAdminPanel } from '@/src/components/admin/ReferralWithdrawalsAdminPanel';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { listReferralWithdrawalsForAdmin } from '@/src/services/referralWithdrawals';
import {
  approveReferralWithdrawalAction,
  markReferralWithdrawalPaidAction,
  rejectReferralWithdrawalAction,
} from '../referral-withdrawal-actions';

export const dynamic = 'force-dynamic';

export default async function ReferralWithdrawalsPage() {
  await requireAdminSession('/admin/revenue/referral-withdrawals');
  const rows = await listReferralWithdrawalsForAdmin();

  return (
    <>
      <PageHeader
        title="Referral withdrawals"
        description="Approve and pay referral earnings — never mixed with deposit refunds."
      />
      <ReferralWithdrawalsAdminPanel
        rows={rows}
        approveAction={approveReferralWithdrawalAction}
        rejectAction={rejectReferralWithdrawalAction}
        markPaidAction={markReferralWithdrawalPaidAction}
      />
    </>
  );
}
