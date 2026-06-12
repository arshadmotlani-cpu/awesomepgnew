import { KYC_STORAGE_NOT_CONFIGURED_ADMIN_MESSAGE } from '@/src/lib/kyc/errors';
import { isKycUploadAvailable } from '@/src/lib/kyc/storage';

export function KycStorageWarning() {
  if (isKycUploadAvailable()) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">KYC uploads disabled</p>
      <p className="mt-1">{KYC_STORAGE_NOT_CONFIGURED_ADMIN_MESSAGE}</p>
      <p className="mt-2 text-xs text-amber-800">
        Residents will see a friendly message and cannot submit documents until Vercel Blob
        private storage is configured. Payment proof uploads also require Blob on Vercel.
      </p>
    </div>
  );
}
