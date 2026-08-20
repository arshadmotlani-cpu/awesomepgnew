import Link from 'next/link';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { OrganizationOnboardingWizard } from '@/src/platform/components/onboarding/OrganizationOnboardingWizard';
import { listPlatformPlans } from '@/src/platform/services/admin';

type Props = { searchParams: Promise<{ success?: string; orgId?: string }> };

export default async function OnboardingPage({ searchParams }: Props) {
  const params = await searchParams;
  const plans = await listPlatformPlans();

  if (params.success === '1' && params.orgId) {
    return (
      <>
        <PageHeader title="Onboarding complete" subtitle="The organization has been provisioned." />
        <div className="max-w-lg rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6">
          <p className="text-sm font-medium text-emerald-400">Organization created successfully</p>
          <p className="mt-2 text-sm text-[var(--plt-text-muted)]">
            The owner invitation is pending. They will receive instructions to accept and set their password.
          </p>
          <div className="mt-4 flex gap-3">
            <Link href={`/platform/admin/organizations/${params.orgId}`} className="plt-btn-primary">
              View organization
            </Link>
            <Link href="/platform/admin/onboarding" className="plt-btn-secondary">
              Onboard another
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Onboarding"
        subtitle="Provision a new FYHAIR salon with location, subscription, and owner invitation."
      />
      {plans.length === 0 ? (
        <p className="text-sm text-[var(--plt-text-muted)]">
          Create a plan first before onboarding organizations.{' '}
          <Link href="/platform/admin/plans" className="text-[var(--plt-accent)] hover:underline">
            Go to Plans
          </Link>
        </p>
      ) : (
        <OrganizationOnboardingWizard plans={plans} />
      )}
    </>
  );
}
