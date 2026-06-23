import Link from 'next/link';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { moduleHref } from '@/src/lib/admin/navigation';

export function ResidentsOperationsAdvancedTools() {
  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Jump to legacy modules — billing, deposits, and detailed workflows."
      defaultOpen={false}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Residents', moduleHref('residents')],
          ['KYC review', moduleHref('kyc')],
          ['Bed assignment', '/admin/beds'],
          ['Move-outs', '/admin/vacating'],
          ['Payment reviews', '/admin/operations/payment-reviews'],
          ['Billing', '/admin/revenue/billing'],
          ['Deposits', moduleHref('deposits')],
          ['Checkout settlements', moduleHref('checkoutSettlements')],
          ['Bookings', '/admin/bookings'],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-white/10 bg-[#121820] px-4 py-3 text-sm font-medium text-apg-silver transition hover:border-white/20 hover:text-white"
          >
            {label} →
          </Link>
        ))}
      </div>
    </AdminAdvancedToolsSection>
  );
}
