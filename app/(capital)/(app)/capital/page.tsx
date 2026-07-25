import { redirect } from 'next/navigation';

/** Capital summary lives on Dashboard; injections can be added from Settings later. */
export default function CapitalRedirectPage() {
  redirect('/dashboard');
}
