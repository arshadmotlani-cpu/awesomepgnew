import { redirect } from 'next/navigation';

/** Ledger lives on each vehicle workspace. */
export default function LedgerRedirectPage() {
  redirect('/assets');
}
