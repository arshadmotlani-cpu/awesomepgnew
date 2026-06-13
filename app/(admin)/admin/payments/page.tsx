import { redirect } from 'next/navigation';

export default function LegacyPaymentsRedirect() {
  redirect('/admin/collections?tab=approvals');
}
