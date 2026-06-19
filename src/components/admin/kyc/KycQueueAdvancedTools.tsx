import {
  AadhaarPdfDownloadButton,
  BulkAadhaarPdfDownloadButton,
} from '@/src/components/admin/AadhaarPdfDownloadButton';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import type { KycSubmissionListRow } from '@/src/services/kyc';

export function KycQueueAdvancedTools({ approvedRows }: { approvedRows: KycSubmissionListRow[] }) {
  if (approvedRows.length === 0) {
    return null;
  }

  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Bulk downloads and per-resident PDF exports — use when you need files offline."
    >
      <div>
        <p className="mb-2 text-xs text-apg-silver">Download all approved Aadhaar PDFs in one zip.</p>
        <BulkAadhaarPdfDownloadButton className="px-3 py-1.5 text-xs" />
      </div>

      <div className="space-y-3 border-t border-white/10 pt-4">
        <p className="text-xs font-medium text-white">Individual PDF downloads</p>
        <ul className="space-y-2">
          {approvedRows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
            >
              <span className="text-apg-silver">{r.customerName}</span>
              <AadhaarPdfDownloadButton
                kycId={r.id}
                status={r.status}
                aadhaarFrontPath={r.aadhaarFrontPath}
                aadhaarBackPath={r.aadhaarBackPath}
                className="px-3 py-1.5 text-xs"
              />
            </li>
          ))}
        </ul>
      </div>
    </AdminAdvancedToolsSection>
  );
}
