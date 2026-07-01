import { redirect } from 'next/navigation';
import { residentPaymentsHref } from '@/src/lib/accountNavigation';

export default function PaymentsRedirect() {
  redirect(residentPaymentsHref('due'));
}
