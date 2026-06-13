import { redirect } from 'next/navigation';

export default function LegacyOverviewAnalyticsRedirect() {
  redirect('/admin/analytics');
}
