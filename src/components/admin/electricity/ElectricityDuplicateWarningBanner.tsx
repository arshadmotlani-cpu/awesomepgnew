import Link from 'next/link';
import { countActiveElectricityInvoiceDuplicates } from '@/src/services/electricityInvoiceDuplicates';

export async function ElectricityDuplicateWarningBanner() {
  const duplicateGroupCount = await countActiveElectricityInvoiceDuplicates();
  if (duplicateGroupCount <= 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
    >
      <strong className="font-semibold text-amber-50">
        {duplicateGroupCount} duplicate electricity invoice
        {duplicateGroupCount === 1 ? ' group' : ' groups'} detected in production.
      </strong>{' '}
      Residents may have been billed twice for the same room and month. Review and repair before
      generating more bills.
      <Link
        href="/admin/electricity/duplicates"
        className="ml-2 font-semibold text-amber-50 underline"
      >
        Open repair screen →
      </Link>
    </div>
  );
}
