import { redirect } from 'next/navigation';

/** Legacy route — packages and memberships are separate configuration modules. */
export default function LegacyMembershipPackagesPage() {
  redirect('/packages');
}
