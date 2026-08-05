import { redirect } from 'next/navigation';

/** Legacy URL — Staff Management lives at /staff. */
export default function WorkforceAdminPage() {
  redirect('/staff');
}
