import { AadhaarPdfDownloadButton } from '@/src/components/admin/AadhaarPdfDownloadButton';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import Link from 'next/link';
import { moduleKycVerifyHref } from '@/src/lib/admin/navigation';

export function KycVerifyAdvancedTools({
  submissionId,
  status,
  aadhaarFrontPath,
  aadhaarBackPath,
  validationReport,
}: {
  submissionId: string;
  status: 'pending' | 'approved' | 'rejected';
  aadhaarFrontPath: string | null;
  aadhaarBackPath: string | null;
  validationReport: unknown;
}) {
  const hasTools = Boolean(validationReport) || status !== 'pending';

  if (!hasTools) {
    return null;
  }

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="PDF export, auto-check details, and refresh — rarely needed day to day."
    >
      {status !== 'pending' ? (
        <div className="space-y-3">
          <AadhaarPdfDownloadButton
            kycId={submissionId}
            status={status}
            aadhaarFrontPath={aadhaarFrontPath}
            aadhaarBackPath={aadhaarBackPath}
            className="px-3 py-1.5 text-xs"
          />
          <Link
            href={moduleKycVerifyHref(submissionId)}
            className="inline-block text-sm text-[#FF5A1F] hover:underline"
          >
            Refresh page
          </Link>
        </div>
      ) : null}

      {validationReport ? (
        <div className={status !== 'pending' ? 'border-t border-white/10 pt-4' : ''}>
          <p className="mb-2 text-xs font-medium text-white">Auto-validation report</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-apg-silver">
            {JSON.stringify(validationReport, null, 2)}
          </pre>
        </div>
      ) : null}
    </AdminAdvancedToolsSection>
  );
}
