import { ApgCard } from '@/src/components/customer/design-system';
import { deriveAdminWaitingMessage } from '@/src/lib/residents/residentHomeState';

export function ResidentHomeAdminWaiting({
  kycStatus,
  documentsSubmitted,
  vacatingStatus,
  checkoutStatus,
  openRequests,
}: {
  kycStatus: string;
  documentsSubmitted: boolean;
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  openRequests: Array<{ status: string }>;
}) {
  const message = deriveAdminWaitingMessage({
    kycStatus,
    documentsSubmitted,
    vacatingStatus,
    checkoutStatus,
    openRequests,
  });

  if (!message) return null;

  return (
    <ApgCard tier="account" className="border-sky-200/80 bg-sky-50/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Waiting on admin</p>
      <p className="mt-1 text-sm text-sky-900">{message}</p>
    </ApgCard>
  );
}
