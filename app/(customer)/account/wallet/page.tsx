import { redirect } from 'next/navigation';
import { residentStayHref } from '@/src/lib/accountNavigation';

export default function WalletRedirect() {
  redirect(residentStayHref('wallet'));
}
