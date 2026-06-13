import { redirect } from 'next/navigation';

/** Action Center merged into Overview — legacy URL redirect. */
export default function ActionCenterRedirect() {
  redirect('/admin/overview');
}
