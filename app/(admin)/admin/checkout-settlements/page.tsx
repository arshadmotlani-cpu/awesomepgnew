import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Checkout work lives on Today's work — avoid a second queue. */
export default function CheckoutSettlementsPage() {
  redirect('/admin/operations/residents');
}
