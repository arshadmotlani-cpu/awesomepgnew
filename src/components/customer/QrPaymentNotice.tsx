import Link from 'next/link';

export function QrPaymentNotice({
  title = 'Pay with UPI QR',
  description = 'All payments are handled via QR codes on each PG listing. Browse PGs, open Payments, scan the QR, and submit your payment screenshot for owner approval.',
  href = '/pgs',
}: {
  title?: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/10 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-apg-silver">{description}</p>
      <Link
        href={href}
        className="mt-3 inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Go to PG payments →
      </Link>
    </div>
  );
}
