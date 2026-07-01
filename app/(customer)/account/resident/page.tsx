import { redirect } from 'next/navigation';
import { legacyResidentTabHref, residentTabHref } from '@/src/lib/accountNavigation';

export default function ResidentDashboardRedirect() {
  redirect(legacyResidentTabHref('home'));
}
