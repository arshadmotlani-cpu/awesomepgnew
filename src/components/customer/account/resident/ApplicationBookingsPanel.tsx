import {
  buildMyBookingCardModels,
} from '@/src/lib/account/myBookingRowPresentation';
import type { MyBookingRow } from '@/src/db/queries/customer';
import type { PaymentProofRejectionRow } from '@/src/services/paymentProofRejectionService';
import { ApplicationBookingsListClient } from '@/src/components/customer/account/resident/ApplicationBookingsListClient';
import {
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';

export function ApplicationBookingsList({
  rows,
  showResidentHome = false,
  customerId = null,
  email = null,
  rejections = [],
}: {
  rows: MyBookingRow[];
  showResidentHome?: boolean;
  customerId?: string | null;
  email?: string | null;
  rejections?: PaymentProofRejectionRow[];
}) {
  const models = buildMyBookingCardModels(rows);

  return (
    <ApplicationBookingsListClient
      models={models}
      showResidentHome={showResidentHome}
      customerId={customerId}
      email={email}
      rejections={rejections}
    />
  );
}

export { ACCOUNT_PAGE_TITLE, ACCOUNT_PAGE_SUBTITLE };
