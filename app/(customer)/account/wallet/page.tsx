import { redirect } from 'next/navigation';
import { residentProfileHref, residentPaymentsHref } from '@/src/lib/accountNavigation';

export default function WalletRedirect() {
  redirect(residentProfileHref('wallet'));
}
