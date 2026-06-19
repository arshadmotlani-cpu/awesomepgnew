import Link from 'next/link';
import { moduleHref } from '@/src/lib/admin/navigation';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';

export function KycVerifyPrimaryActions({
  customerId,
  isPending,
}: {
  customerId: string;
  isPending: boolean;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {isPending
          ? 'Check all three photos on the left, then approve or reject with a clear reason.'
          : 'This submission is already decided. Download the PDF or open the resident profile if needed.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {isPending ? (
          <a href="#review-decision" className={PRIMARY}>
            Approve or reject below
          </a>
        ) : null}
        <Link href={moduleHref('kyc')} className={isPending ? SECONDARY : PRIMARY}>
          Back to identity queue
        </Link>
        <Link href={`/admin/residents/${customerId}`} className={SECONDARY}>
          Open resident profile
        </Link>
      </div>
    </section>
  );
}
