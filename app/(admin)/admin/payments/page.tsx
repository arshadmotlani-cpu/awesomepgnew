import { redirect } from 'next/navigation';

export default function LegacyPaymentsRedirect() {
  redirect('/admin/operations?filter=waiting_for_approval');
}
