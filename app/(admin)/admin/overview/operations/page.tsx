import { redirect } from 'next/navigation';

export default function LegacyOverviewOperationsRedirect() {
  redirect('/admin/operations');
}
