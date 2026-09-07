import { redirect } from 'next/navigation';
import { RENT_PAYMENT_MAP_HREF } from '@/src/lib/admin/rentPaymentMapRoutes';

export const dynamic = 'force-dynamic';

/** Legacy invoices tab URL — forwards to Operations entry point. */
export default function LegacyInvoicesRentPaymentMapRedirect() {
  redirect(RENT_PAYMENT_MAP_HREF.operations);
}
