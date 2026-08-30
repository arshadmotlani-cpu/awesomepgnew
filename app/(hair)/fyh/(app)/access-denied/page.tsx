import Link from 'next/link';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { resolveDefaultLandingPath } from '@/src/hair/lib/auth/guards';

export default async function AccessDeniedPage() {
  const admin = await requireHairAuthPage();
  const home = resolveDefaultLandingPath(admin);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center space-y-4 text-center">
      <p className="fyh-section-eyebrow">Access denied</p>
      <h1 className="fyh-display text-2xl font-semibold text-fyh-text">You don&apos;t have permission</h1>
      <p className="text-sm text-fyh-text-secondary">
        This area is restricted to salon administrators and managers. Contact your owner if you need
        access.
      </p>
      <Link
        href={home}
        className="inline-flex rounded-lg bg-fyh-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Go to your workspace
      </Link>
    </div>
  );
}
