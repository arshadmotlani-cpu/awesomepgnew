import { redirect } from 'next/navigation';

export default function LegacyPaymentsRedirect() {
  redirect('/admin/operations?tab=waiting');
}
