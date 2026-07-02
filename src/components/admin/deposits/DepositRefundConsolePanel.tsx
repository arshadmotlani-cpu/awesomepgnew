import Link from 'next/link';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';

export function DepositRefundConsolePanel({ bookingId }: { bookingId: string }) {
  return (
    <div className="rounded-2xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-5">
      <h3 className="text-sm font-semibold text-white">Refund payout</h3>
      <p className="mt-1 text-xs text-apg-silver">
        Process deductions, transfers, and final refund payout for this booking.
      </p>
      <Link
        href={refundConsoleHref(bookingId)}
        className="mt-4 inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        Process refund →
      </Link>
    </div>
  );
}
