import { redirect } from 'next/navigation';
import { residentTabHref } from '@/src/lib/accountNavigation';

export default function PaymentsRedirect() {
  redirect(residentTabHref('payments'));
}
