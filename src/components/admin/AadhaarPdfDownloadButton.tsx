'use client';

import { IconDownload } from '@/src/components/admin/icons';
import { adminAadhaarPdfUrl, kycHasAadhaarImages } from '@/src/lib/kyc/documentUrls';

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

export function AadhaarPdfDownloadButton({
  kycId,
  status,
  aadhaarFrontPath,
  aadhaarBackPath,
  className,
}: {
  kycId: string;
  status: 'pending' | 'approved' | 'rejected';
  aadhaarFrontPath?: string | null;
  aadhaarBackPath?: string | null;
  className?: string;
}) {
  if (status !== 'approved') return null;

  const hasImages = kycHasAadhaarImages({ aadhaarFrontPath, aadhaarBackPath });

  if (!hasImages) {
    return (
      <button
        type="button"
        disabled
        title="Aadhaar images unavailable"
        className={`${baseClass} border border-white/10 bg-[#12161C] text-apg-silver ${className ?? ''}`}
      >
        <IconDownload className="h-4 w-4 shrink-0" aria-hidden />
        Aadhaar images unavailable
      </button>
    );
  }

  return (
    <a
      href={adminAadhaarPdfUrl(kycId)}
      download
      className={`${baseClass} border border-white/10 bg-[#12161C] text-white hover:bg-white/5 ${className ?? ''}`}
    >
      <IconDownload className="h-4 w-4 shrink-0" aria-hidden />
      Download Aadhaar PDF
    </a>
  );
}

export function BulkAadhaarPdfDownloadButton({ className }: { className?: string }) {
  return (
    <a
      href="/api/admin/kyc/aadhaar-pdf-bulk"
      download
      className={`${baseClass} border border-sky-400/30 text-sky-200 hover:bg-sky-500/10 ${className ?? ''}`}
    >
      <IconDownload className="h-4 w-4 shrink-0" aria-hidden />
      Download All Approved Aadhaar PDFs
    </a>
  );
}
