import { DepositAdjustForms } from '@/src/components/admin/DepositAdjustForms';
import { DepositDetailSection } from '@/src/components/admin/deposits/DepositDetailSection';

export function DepositActivitySection({ bookingId }: { bookingId: string }) {
  return (
    <DepositDetailSection
      id="deposit-activity"
      title="Deposit activity"
      description="Record money collected, charges taken from the deposit, or refunds paid out."
    >
      <DepositAdjustForms bookingId={bookingId} />
    </DepositDetailSection>
  );
}
