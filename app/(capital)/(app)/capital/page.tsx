import { redirect } from 'next/navigation';

/** Capital inject / Funding History removed — dealership OS uses Dashboard. */
export default function CapitalRedirectPage() {
  redirect('/dashboard');
}
