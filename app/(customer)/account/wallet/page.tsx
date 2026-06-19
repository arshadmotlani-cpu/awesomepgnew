import { redirect } from 'next/navigation';
import { residentTabHref } from '@/src/lib/accountNavigation';

export default function WalletRedirect() {
  redirect(residentTabHref('wallet'));
}
