import { redirect } from 'next/navigation';

export default function LegacyAdminKycRedirect() {
  redirect('/admin/residents/kyc');
}
