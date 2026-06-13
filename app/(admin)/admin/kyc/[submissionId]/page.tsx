import { redirect } from 'next/navigation';

export default async function LegacyAdminKycDetailRedirect({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  redirect(`/admin/residents/kyc/${submissionId}`);
}
