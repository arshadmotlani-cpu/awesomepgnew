import { redirect } from 'next/navigation';

/** Documents live on each vehicle workspace. */
export default function DocumentsRedirectPage() {
  redirect('/assets');
}
