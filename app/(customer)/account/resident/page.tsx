import { redirect } from 'next/navigation';
import { accountProfileHref } from '@/src/lib/accountNavigation';

export default function ResidentDashboardRedirect() {
  redirect(accountProfileHref('resident'));
}
