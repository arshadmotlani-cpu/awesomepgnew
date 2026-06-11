import { redirect } from 'next/navigation';

export default function LegacyPricingRedirect() {
  redirect('/admin/pgs');
}
