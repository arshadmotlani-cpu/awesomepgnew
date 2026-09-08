import { redirect } from 'next/navigation';
import { residentStayHref } from '@/src/lib/accountNavigation';

export default function PaymentsRedirect() {
  redirect(residentStayHref('payments'));
}
