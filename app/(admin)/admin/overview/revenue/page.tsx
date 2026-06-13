import { redirect } from 'next/navigation';

export default function LegacyOverviewRevenueRedirect() {
  redirect('/admin/revenue');
}
